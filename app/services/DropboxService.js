'use strict';

var path = require('path');
var Promise = require('promise');
var Dropbox = require('../../lib/dropbox');

var SECONDS = 1000;
var DROPBOX_DELTA_CACHE_EXPIRY = 30 * SECONDS;

function DropboxService() {
}

DropboxService.prototype.client = null;
DropboxService.prototype.connecting = false;

DropboxService.prototype.generateAppToken = function(config) {
	return new Promise(function(resolve, reject) {
		var client = new Dropbox.Client({
			key: config.appKey,
			secret: config.appSecret,
			sandbox: false
		});

		client.authDriver(new Dropbox.AuthDriver.NodeServer(8191));

		client.authenticate(function(error, client) {
			if (error) { return reject(error); }
			var appToken = client._oauth._token;
			return resolve(appToken);
		});
	});
};

DropboxService.prototype.connect = function(config) {
	var self = this;
	return new Promise(function(resolve, reject) {
		if (self.connecting) { throw new Error('Connection attempt already in progress'); }
		if (self.client) { throw new Error('Already connected'); }

		self.connecting = true;

		var client = new Dropbox.Client({
			key: config.appKey,
			secret: config.appSecret,
			token: config.appToken,
			sandbox: false
		});


		client.onError.addListener(function(error) {
			if (error.status === 304) { return; }
			process.stderr.write('Dropbox API error: ' + self.getErrorType(error) + '\n');
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
		return 'Dropbox.ApiError.INVALID_TOKEN';

	case Dropbox.ApiError.OVER_QUOTA:
		// The user is over their Dropbox quota.
		// Tell them their Dropbox is full. Refreshing the page won't help.
		return 'Dropbox.ApiError.INVALID_TOKEN';

	case Dropbox.ApiError.RATE_LIMITED:
		// Too many API requests. Tell the user to try again later.
		// Long-term, optimize your code to use fewer API calls.
		return 'Dropbox.ApiError.INVALID_TOKEN';

	case Dropbox.ApiError.NETWORK_ERROR:
		// An error occurred at the XMLHttpRequest layer.
		// Most likely, the user's network connection is down.
		// API calls will not succeed until the user gets back online.
		return 'Dropbox.ApiError.INVALID_TOKEN';

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
	var client = this.client;
	return new Promise(function(resolve, reject) {
		var cacheCursor = (folderCache && folderCache.cursor) || null;
		var cacheRoot = (folderCache && folderCache.data) || null;
		var cacheUpdated = (folderCache && folderCache.updated) || null;

		var needsUpdate = checkWhetherNeedsUpdate(cacheUpdated, DROPBOX_DELTA_CACHE_EXPIRY);
		if (!needsUpdate) {
			var folderCacheContents = getFileMetadata(folderCache.data);
			return resolve({
				contents: folderCacheContents,
				cache: folderCache
			});
		}

		client.delta(cacheCursor || 0, folderPath, onDeltaLoaded);


		function onDeltaLoaded(error, pulledChanges) {
			if (error) { return reject(error); }

			cacheCursor = pulledChanges.cursorTag;

			var cachePathLookupTable = getCacheDictionary(cacheRoot, pulledChanges, folderPath);
			cacheRoot = cachePathLookupTable[folderPath.toLowerCase()];

			pulledChanges.changes.forEach(function(changeModel) {
				var changePath = changeModel.path.toLowerCase();

				var parentPath = changePath.substr(0, changePath.lastIndexOf('/')).toLowerCase();
				var parentFolder = cachePathLookupTable[parentPath] || null;

				if (changeModel.wasRemoved) {
					if (parentFolder && parentFolder.contents) {
						parentFolder.contents = parentFolder.contents.filter(function(siblingFolder) {
							return siblingFolder.path.toLowerCase() !== changePath;
						});
					}
				} else {
					var fileModel = changeModel.stat.json();
					if (fileModel.is_dir) { fileModel.contents = []; }
					if (parentFolder) {
						parentFolder.contents.push(fileModel);
					}
					cachePathLookupTable[changePath] = fileModel;
				}
			});

			if (pulledChanges.shouldPullAgain) {
				client.delta(cacheCursor, folderPath, onDeltaLoaded);
			} else {
				var updatedFolderCache = {
					updated: new Date(),
					cursor: cacheCursor,
					data: cacheRoot
				};
				var folderCacheContents = getFileMetadata(updatedFolderCache.data);
				return resolve({
					contents: folderCacheContents,
					cache: updatedFolderCache
				});
			}
		}
	});


	function checkWhetherNeedsUpdate(lastUpdated, cacheDuration) {
		if (!lastUpdated) { return true; }
		var delta = (new Date() - lastUpdated);
		return (delta > cacheDuration);
	}


	function getCacheDictionary(cacheRoot, pulledChanges, folderPath) {
		var cacheDictionary;
		cacheRoot = updateCacheRoot(cacheRoot, pulledChanges, folderPath);
		cacheDictionary = buildCacheDictionary(cacheRoot);
		addItemToCache(cacheRoot, cacheDictionary);

		return cacheDictionary;


		function buildCacheDictionary(cacheRoot, cacheDictionary) {
			cacheDictionary = cacheDictionary || {};
			if (!cacheRoot) { return cacheDictionary; }
			addItemToCache(cacheRoot, cacheDictionary);
			if (cacheRoot.contents) {
				cacheDictionary = cacheRoot.contents.reduce(function(cacheDictionary, cacheEntry) {
					return buildCacheDictionary(cacheEntry, cacheDictionary);
				}, cacheDictionary);
			}
			return cacheDictionary;
		}
	}


	function updateCacheRoot(cacheRoot, pulledChanges, folderPath) {
		if (pulledChanges.blankSlate) { cacheRoot = null; }
		pulledChanges.changes.forEach(function(changeModel) {
			var isRootFolder = checkWhetherIsRootFolder(changeModel, folderPath);
			if (!isRootFolder) { return; }
			if (changeModel.wasRemoved) {
				cacheRoot = null;
			} else {
				cacheRoot = getFileModel(changeModel);
			}
		});
		return cacheRoot;
	}

	function addItemToCache(cacheItem, cacheDictionary) {
		cacheDictionary[cacheItem.path.toLowerCase()] = cacheItem;
		return cacheItem;
	}

	function checkWhetherIsRootFolder(changeModel, folderPath) {
		return (changeModel.path.toLowerCase() === folderPath.toLowerCase());
	}

	function getFileModel(changeModel) {
		var fileModel = changeModel.stat.json();
		if (fileModel.is_dir) { fileModel.contents = []; }
		return fileModel;
	}

	function getFileMetadata(statModel) {
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
				return getFileMetadata(childStatModel);
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
