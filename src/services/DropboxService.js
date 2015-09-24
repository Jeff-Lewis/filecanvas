'use strict';

var path = require('path');
var Dropbox = require('dropbox');
var objectAssign = require('object-assign');

var HttpError = require('../errors/HttpError');


function DropboxService() {
}

DropboxService.prototype.connect = function(appKey, appSecret, accessToken, uid) {
	if (!appKey) { return Promise.reject(new Error('No app key specified')); }
	if (!appSecret) { return Promise.reject(new Error('No access token specified')); }
	if (!uid) { return Promise.reject(new Error('No user ID specified')); }

	return new Promise(function(resolve, reject) {
		new Dropbox.Client({
			key: appKey,
			secret: appSecret,
			token: accessToken,
			uid: uid,
			sandbox: false
		})
		.authenticate(function(error, client) {
			if (error) { return reject(error); }
			return resolve(client);
		});
	})
	.then(function(client) {
		return new DropboxClient(client);
	});
};


function DropboxClient(client) {
	this.client = client;
}

DropboxClient.prototype.client = null;

DropboxClient.prototype.retrieveFileMetadata = function(filePath) {
	var client = this.client;
	return retrieveFileMetadata(client, filePath);


	function retrieveFileMetadata(client, filePath) {
		return new Promise(function(resolve, reject) {
			var options = {};
			client.stat(filePath, options, function(error, stat) {
				if (error) { return reject(error); }
				resolve(stat);
			});
		});
	}
};

DropboxClient.prototype.loadFolderContents = function(folderPath, folderCache) {
	var self = this;
	var client = this.client;

	var cacheCursor = (folderCache && folderCache.cursor) || null;
	var cacheRoot = (folderCache && folderCache.data) || null;

	var cursor = cacheCursor || 0;
	var options = {
		pathPrefix: folderPath
	};
	return loadFolder(client, cursor, options, cacheRoot);


	function loadFolder(client, cursor, options, cache) {
		var rootPath = options.pathPrefix || '/';
		return loadFolderDelta(client, cursor, options)
			.catch(function(error) {
				var isUsingCursor = Boolean(cursor);
				if (isUsingCursor && (error.status === Dropbox.ApiError.INVALID_PARAM)) {
					cursor = 0;
					cache = null;
					return loadFolderDelta(client, cursor, options);
				}
				throw new HttpError(error.status, self.getErrorType(error));
			})
			.then(function(pulledChanges) {
				var updatedCursor = pulledChanges.cursorTag;

				cache = getUpdatedCacheRoot(cache, pulledChanges, rootPath);
				var cacheDictionary = buildCacheDictionary(cache);

				pulledChanges.changes.sort(function(changeModel1, changeModel2) {
					return (changeModel1.path.toLowerCase() < changeModel2.path.toLowerCase() ? -1 : 1);
				}).forEach(function(changeModel) {
					var itemPath = changeModel.path.toLowerCase();
					var parentPath = path.dirname(itemPath);
					var parentFolder = cacheDictionary[parentPath] || null;

					if (changeModel.wasRemoved) {
						if (parentFolder && parentFolder.contents) {
							parentFolder.contents = parentFolder.contents.filter(function(siblingItem) {
								return siblingItem.path.toLowerCase() !== itemPath;
							});
						}
						delete cacheDictionary[itemPath];
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
					return loadFolder(client, updatedCursor, options, cache);
				} else {
					return {
						data: cache,
						cursor: updatedCursor
					};
				}


				function getUpdatedCacheRoot(cache, pulledChanges, rootPath) {
					if (pulledChanges.blankSlate) { cache = null; }
					pulledChanges.changes.forEach(function(changeModel) {
						var isRootFolder = (changeModel.path.toLowerCase() === rootPath.toLowerCase());
						if (isRootFolder) {
							if (changeModel.wasRemoved) {
								cache = null;
							} else {
								var fileModel = changeModel.stat.json();
								if (fileModel.is_dir) { fileModel.contents = []; }
								cache = fileModel;
							}
						}
					});
					return cache;
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


		function loadFolderDelta(client, cursor, options) {
			return new Promise(function(resolve, reject) {
				client.delta(cursor, options, function(error, pulledChanges) {
					if (error) { return reject(error); }
					return resolve(pulledChanges);
				});
			});
		}
	}
};

DropboxClient.prototype.writeFile = function(path, data, options) {
	var client = this.client;
	return writeFile(client, path, data, options);


	function writeFile(client, path, data, options) {
		return new Promise(function(resolve, reject) {
			client.writeFile(path, data, options, function(error, stat) {
				if (error) { return reject(error); }
				resolve(stat);
			});
		});
	}
};

DropboxClient.prototype.generateDownloadLink = function(filePath) {
	var self = this;
	return new Promise(function(resolve, reject) {
		var generateTemporaryUrl = true;
		self.client.makeUrl(filePath, { download: generateTemporaryUrl },
			function(error, shareUrlModel) {
				if (error) { return reject(error); }
				return resolve(shareUrlModel.url);
			}
		);
	});
};

DropboxClient.prototype.generateThumbnailLink = function(filePath) {
	var self = this;
	var thumbnailUrl = self.client.thumbnailUrl(filePath, { format: 'jpeg', size: 'l' });
	return Promise.resolve(thumbnailUrl);
};

DropboxClient.prototype.getErrorType = function(error) {
	switch (error.status) {
	case Dropbox.ApiError.INVALID_TOKEN:
		// If you're using dropbox.js, the only cause behind this error is that
		// the user token expired.
		// Get the user through the authentication flow again.
		return 'DropboxClient.ApiError.INVALID_TOKEN';

	case Dropbox.ApiError.NOT_FOUND:
		// The file or folder you tried to access is not in the user's DropboxClient.
		// Handling this error is specific to your application.
		return 'DropboxClient.ApiError.NOT_FOUND';

	case Dropbox.ApiError.OVER_QUOTA:
		// The user is over their DropboxClient quota.
		// Tell them their DropboxClient is full. Refreshing the page won't help.
		return 'DropboxClient.ApiError.OVER_QUOTA';

	case Dropbox.ApiError.RATE_LIMITED:
		// Too many API requests. Tell the user to try again later.
		// Long-term, optimize your code to use fewer API calls.
		return 'DropboxClient.ApiError.RATE_LIMITED';

	case Dropbox.ApiError.NETWORK_ERROR:
		// An error occurred at the XMLHttpRequest layer.
		// Most likely, the user's network connection is down.
		// API calls will not succeed until the user gets back online.
		return 'DropboxClient.ApiError.NETWORK_ERROR';

	case Dropbox.ApiError.INVALID_PARAM:
		return 'DropboxClient.ApiError.INVALID_PARAM';

	case Dropbox.ApiError.OAUTH_ERROR:
		return 'DropboxClient.ApiError.OAUTH_ERROR';

	case Dropbox.ApiError.INVALID_METHOD:
		return 'DropboxClient.ApiError.INVALID_METHOD';

	default:
		// Caused by a bug in dropbox.js, in your application, or in DropboxClient.
		// Tell the user an error occurred, ask them to refresh the page.
	}
};

module.exports = DropboxService;
