'use strict';

var path = require('path');
var Promise = require('promise');
var Dropbox = require('dropbox');
var objectAssign = require('object-assign');

var HttpError = require('../errors/HttpError');

var SECONDS = 1000;
var DROPBOX_DELTA_CACHE_EXPIRY = 5 * SECONDS;

function DropboxService() {
}

DropboxService.prototype.client = null;
DropboxService.prototype.connecting = false;

DropboxService.prototype.generateAccessToken = function(appKey, appSecret) {
	var self = this;
	return new Promise(function(resolve, reject) {
		var client = new Dropbox.Client({
			key: appKey,
			secret: appSecret,
			sandbox: false
		});

		client.authDriver(new Dropbox.AuthDriver.NodeServer(8191));

		client.authenticate(function(error, client) {
			if (error) { return reject(new HttpError(error.status, self.getErrorType(error))); }
			var accessToken = client._oauth._token;
			return resolve(accessToken);
		});
	});
};

DropboxService.prototype.connect = function(appKey, appSecret, accessToken) {
	var self = this;
	return new Promise(function(resolve, reject) {
		if (self.connecting) { throw new Error('Connection attempt already in progress'); }
		if (self.client) { throw new Error('Already connected'); }

		self.connecting = true;

		var client = new Dropbox.Client({
			key: appKey,
			secret: appSecret,
			token: accessToken,
			sandbox: false
		});

		client.authenticate(function(error, client) {
			self.connecting = false;
			if (error) { return reject(error); }
			self.client = client;
			return resolve(client);
		});
	});
};

DropboxService.prototype.getErrorType = function(error) {
	switch (error.status) {
	case Dropbox.ApiError.INVALID_TOKEN:
		// If you're using dropbox.js, the only cause behind this error is that
		// the user token expired.
		// Get the user through the authentication flow again.
		return 'Dropbox.ApiError.INVALID_TOKEN';

	case Dropbox.ApiError.NOT_FOUND:
		// The file or folder you tried to access is not in the user's Dropbox.
		// Handling this error is specific to your application.
		return 'Dropbox.ApiError.NOT_FOUND';

	case Dropbox.ApiError.OVER_QUOTA:
		// The user is over their Dropbox quota.
		// Tell them their Dropbox is full. Refreshing the page won't help.
		return 'Dropbox.ApiError.OVER_QUOTA';

	case Dropbox.ApiError.RATE_LIMITED:
		// Too many API requests. Tell the user to try again later.
		// Long-term, optimize your code to use fewer API calls.
		return 'Dropbox.ApiError.RATE_LIMITED';

	case Dropbox.ApiError.NETWORK_ERROR:
		// An error occurred at the XMLHttpRequest layer.
		// Most likely, the user's network connection is down.
		// API calls will not succeed until the user gets back online.
		return 'Dropbox.ApiError.NETWORK_ERROR';

	case Dropbox.ApiError.INVALID_PARAM:
		return 'Dropbox.ApiError.INVALID_PARAM';

	case Dropbox.ApiError.OAUTH_ERROR:
		return 'Dropbox.ApiError.OAUTH_ERROR';

	case Dropbox.ApiError.INVALID_METHOD:
		return 'Dropbox.ApiError.INVALID_METHOD';

	default:
		// Caused by a bug in dropbox.js, in your application, or in Dropbox.
		// Tell the user an error occurred, ask them to refresh the page.
	}
};

DropboxService.prototype.loadFolderContents = function(folderPath, folderCache) {
	var self = this;
	var client = this.client;

	var cacheCursor = (folderCache && folderCache.cursor) || null;
	var cacheRoot = (folderCache && folderCache.data) || null;
	var cacheUpdated = (folderCache && folderCache.updated) || null;

	var needsUpdate = checkWhetherNeedsUpdate(cacheUpdated, DROPBOX_DELTA_CACHE_EXPIRY);
	if (!needsUpdate) {
		var folderModel = parseStatModel(folderCache.data);
		return Promise.resolve({
			contents: folderModel,
			cache: folderCache
		});
	}

	var cursor = cacheCursor || 0;
	var options = {
		pathPrefix: folderPath
	};
	return loadFolder(client, cursor, options, cacheRoot);


	function loadFolder(client, cursor, options, cache) {
		var rootPath = options.pathPrefix || '/';
		return new Promise(function(resolve, reject) {
			client.delta(cursor, options, function(error, pulledChanges) {
				if (error) { return reject(new HttpError(error.status, self.getErrorType(error))); }
				return resolve(pulledChanges);
			});
		})
		.then(function(pulledChanges) {
			var updatedCursor = pulledChanges.cursorTag;

			var cacheRoot = getUpdatedCacheRoot(cache, pulledChanges, rootPath);
			var cacheDictionary = buildCacheDictionary(cacheRoot);

			pulledChanges.changes.forEach(function(changeModel) {
				var itemPath = changeModel.path.toLowerCase();
				var parentPath = path.dirname(itemPath);
				var parentFolder = cacheDictionary[parentPath] || null;

				if (changeModel.wasRemoved) {
					if (parentFolder && parentFolder.contents) {
						parentFolder.contents = parentFolder.contents.filter(function(siblingItem) {
							return siblingItem.path.toLowerCase() !== itemPath;
						});
					}
				} else {
					var fileModel = changeModel.stat.json();
					if (fileModel.is_dir) { fileModel.contents = []; }
					if (parentFolder && parentFolder.contents) {
						parentFolder.contents = parentFolder.contents.filter(function(siblingItem) {
							return siblingItem.path.toLowerCase() !== itemPath;
						});
						parentFolder.contents.push(fileModel);
					}
					cacheDictionary[itemPath] = fileModel;
				}
			});

			if (pulledChanges.shouldPullAgain) {
				return loadFolder(client, updatedCursor, options, cacheRoot);
			} else {
				var itemModel = parseStatModel(cacheRoot);
				var itemCache = {
					cursor: updatedCursor,
					data: cacheRoot,
					updated: new Date()
				};
				return {
					contents: itemModel,
					cache: itemCache
				};
			}


			function getUpdatedCacheRoot(cacheRoot, pulledChanges, rootPath) {
				if (pulledChanges.blankSlate) { cacheRoot = null; }
				pulledChanges.changes.forEach(function(changeModel) {
					var isRootFolder = (changeModel.path.toLowerCase() === rootPath.toLowerCase());
					if (isRootFolder) {
						if (changeModel.wasRemoved) {
							cacheRoot = null;
						} else {
							var fileModel = changeModel.stat.json();
							if (fileModel.is_dir) { fileModel.contents = []; }
							cacheRoot = fileModel;
						}
					}
				});
				return cacheRoot;
			}

			function buildCacheDictionary(cacheItem) {
				var dictionary = {};
				if (!cacheItem) { return dictionary; }
				var key = cacheItem.path.toLowerCase();
				dictionary[key] = cacheItem;
				if (cacheItem.contents) {
					var childEntries = cacheItem.contents.reduce(function(childEntries, cacheItem) {
						var childDictionary = buildCacheDictionary(cacheItem);
						objectAssign(childEntries, childDictionary);
						return childEntries;
					}, {});
					objectAssign(dictionary, childEntries);
				}
				return dictionary;
			}
		});
	}


	function checkWhetherNeedsUpdate(lastUpdated, cacheDuration) {
		if (!lastUpdated) { return true; }
		var delta = (new Date() - lastUpdated);
		return (delta > cacheDuration);
	}

	function parseStatModel(statModel) {
		var fileMetadata = Object.keys(statModel)
			.filter(function(property) {
				return (property.charAt(0) !== '_') && (property !== 'contents');
			}).reduce(function(fileMetadata, property) {
				fileMetadata[property] = statModel[property];
				return fileMetadata;
			}, {});

		fileMetadata.name = path.basename(fileMetadata.path);
		fileMetadata.alias = slugify(fileMetadata.name);

		var modifiedDate = new Date(fileMetadata.modified);
		fileMetadata.date = formatDate(modifiedDate);
		fileMetadata.timestamp = getTimestamp(modifiedDate);

		if (fileMetadata.is_dir) {
			fileMetadata.label = stripLeadingNumber(fileMetadata.name);
			fileMetadata.contents = statModel.contents.map(function(childStatModel) {
				return parseStatModel(childStatModel);
			});
		} else {
			fileMetadata.label = stripLeadingNumber(stripFileExtension(fileMetadata.name));
			fileMetadata.extension = getFileExtension(fileMetadata.name);
		}
		return fileMetadata;
	}

	function slugify(string) {
		return string.toLowerCase().replace(/[^a-z0-9_]+/g, '-');
	}

	function getTimestamp(date) {
		return Math.floor(date.getTime() / 1000);
	}

	function formatDate(date) {
		var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
		var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dev'];
		return DAYS[date.getDay()] + ' ' + date.getDate() + ' ' + MONTHS[date.getMonth()] + ' ' + date.getFullYear();
	}

	function stripLeadingNumber(string) {
		return string.replace(/^[0-9]+[ \.\-\|]*/, '');
	}

	function getFileExtension(filename) {
		var extname = path.extname(filename);
		return extname.substr(extname.indexOf('.') + 1);
	}

	function stripFileExtension(filename) {
		return path.basename(filename, path.extname(filename));
	}
};

module.exports = DropboxService;
