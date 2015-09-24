'use strict';

var path = require('path');
var express = require('express');
var objectAssign = require('object-assign');
var isEqual = require('lodash.isequal');
var slug = require('slug');
var mapSeries = require('promise-map-series');
var Dropbox = require('dropbox');
var DropboxOAuth2Strategy = require('passport-dropbox-oauth2').Strategy;

var UserService = require('../services/UserService');
var RegistrationService = require('../services/RegistrationService');

var FileModel = require('../models/FileModel');

var HttpError = require('../errors/HttpError');

function DropboxAdapter(database, options) {
	options = options || {};
	var appKey = options.appKey;
	var appSecret = options.appSecret;
	var loginCallbackUrl = options.loginCallbackUrl;
	var registerCallbackUrl = options.registerCallbackUrl;

	if (!database) { throw new Error('Missing database'); }
	if (!appKey) { throw new Error('Missing Dropbox app key'); }
	if (!appSecret) { throw new Error('Missing Dropbox app appSecret'); }
	if (!loginCallbackUrl) { throw new Error('Missing Dropbox login callback URL'); }
	if (!registerCallbackUrl) { throw new Error('Missing Dropbox register callback URL'); }

	this.database = database;
	this.appKey = appKey;
	this.appSecret = appSecret;
	this.loginCallbackUrl = loginCallbackUrl;
	this.registerCallbackUrl = registerCallbackUrl;
}

DropboxAdapter.prototype.database = null;
DropboxAdapter.prototype.appKey = null;
DropboxAdapter.prototype.appSecret = null;
DropboxAdapter.prototype.loginCallbackUrl = null;
DropboxAdapter.prototype.registerCallbackUrl = null;

DropboxAdapter.prototype.loginMiddleware = function(passport, passportOptions, callback) {
	var database = this.database;
	var appKey = this.appKey;
	var appSecret = this.appSecret;
	var loginCallbackUrl = this.loginCallbackUrl;

	var app = express();

	app.post('/', passport.authenticate('admin/dropbox'));
	app.get('/oauth2/callback', passport.authenticate('admin/dropbox', passportOptions), callback);

	passport.use('admin/dropbox', new DropboxOAuth2Strategy({
			clientID: appKey,
			clientSecret: appSecret,
			callbackURL: loginCallbackUrl,
			passReqToCallback: true
		},
		function(req, accessToken, refreshToken, profile, callback) {
			var uid = profile.id;
			var firstName = profile._json.name_details.given_name;
			var lastName = profile._json.name_details.surname;
			var email = profile.emails[0].value;
			var userDetails = {
				firstName: firstName,
				lastName: lastName,
				email: email
			};
			return loginUser(req, uid, accessToken, userDetails)
				.then(function(userModel) {
					callback(null, userModel);
				})
				.catch(function(error) {
					if (error.status === 401) {
						return callback(null, false);
					}
					callback(error);
				});


			function loginUser(req, uid, accessToken, userDetails) {
				var adapterConfig = objectAssign({
					uid: uid,
					token: accessToken
				}, userDetails);
				var userService = new UserService(database);
				var registrationService = new RegistrationService(req);
				registrationService.clearPendingUser();
				return userService.retrieveAdapterUser('dropbox', { 'uid': uid })
					.catch(function(error) {
						if (error.status === 404) {
							var fullName = firstName + ' ' + lastName;
							var username = slug(fullName, { lower: true });
							var userDetails = {
								username: username,
								firstName: firstName,
								lastName: lastName,
								email: email
							};
							var adapterConfig = {
								uid: uid,
								token: accessToken,
								firstName: firstName,
								lastName: lastName,
								email: email
							};
							registrationService.setPendingUser(userDetails, 'dropbox', adapterConfig);
							throw new HttpError(401);
						}
						throw error;
					})
					.then(function(userModel) {
						var username = userModel.username;
						var userAdapterConfig = userModel.adapters.dropbox;
						var hasUpdatedUserDetails = !isEqual(userAdapterConfig, adapterConfig);
						if (hasUpdatedUserDetails) {
							return userService.updateUserAdapterSettings(username, 'dropbox', adapterConfig)
								.then(function() {
									var userAdapterConfig = userModel.adapters.dropbox;
									userAdapterConfig.token = accessToken;
									userAdapterConfig.firstName = firstName;
									userAdapterConfig.lastName = lastName;
									userAdapterConfig.email = email;
									return userModel;
								});
						} else {
							return userModel;
						}
					});
			}
		}
	));

	return app;
};

DropboxAdapter.prototype.initSiteFolder = function(sitePath, siteFiles, options) {
	var appKey = this.appKey;
	var appSecret = this.appSecret;
	var uid = options.uid;
	var accessToken = options.token;
	return new DropboxConnector().connect(appKey, appSecret, accessToken, uid)
		.then(function(dropboxClient) {
			return checkWhetherFileExists(dropboxClient, sitePath)
				.then(function(folderExists) {
					if (folderExists) { return; }
					return copySiteFiles(dropboxClient, siteFiles);
				});
		});

	function checkWhetherFileExists(dropboxClient, filePath) {
		return dropboxClient.retrieveFileMetadata(filePath)
			.then(function(stat) {
				if (stat.isRemoved) { return false; }
				return true;
			})
			.catch(function(error) {
				if (error.status === 404) {
					return false;
				}
				throw error;
			});
	}

	function copySiteFiles(dropboxClient, dirContents) {
		var files = getFileListing(dirContents);
		var writeOptions = {};
		return Promise.resolve(mapSeries(files, function(fileMetaData) {
			var filePath = fileMetaData.path;
			var fileContents = fileMetaData.contents;
			return dropboxClient.writeFile(filePath, fileContents, writeOptions);
		}).then(function(results) {
			return;
		}));


		function getFileListing(namedFiles) {
			var files = Object.keys(namedFiles)
				.sort(function(filePath1, filePath2) {
					return (filePath1 < filePath2 ? -1 : 1);
				})
				.map(function(filePath) {
					var file = namedFiles[filePath];
					return {
						path: filePath,
						contents: file
					};
				});
			return files;
		}
	}
};

DropboxAdapter.prototype.loadFolderContents = function(folderPath, options) {
	var appKey = this.appKey;
	var appSecret = this.appSecret;
	var uid = options.uid;
	var accessToken = options.token;
	var cache = options.cache;
	return new DropboxConnector().connect(appKey, appSecret, accessToken, uid)
		.then(function(dropboxClient) {
			return dropboxClient.loadFolderContents(folderPath, cache);
		})
		.then(function(dropboxContents) {
			var folder = parseStatModel(dropboxContents.data, folderPath);
			return {
				root: folder,
				cache: dropboxContents
			};
		});
};

DropboxAdapter.prototype.retrieveDownloadLink = function(filePath, options) {
	var appKey = this.appKey;
	var appSecret = this.appSecret;
	var uid = options.uid;
	var accessToken = options.token;
	return new DropboxConnector().connect(appKey, appSecret, accessToken, uid)
		.then(function(dropboxClient) {
			return dropboxClient.generateDownloadLink(filePath);
		});
};

DropboxAdapter.prototype.retrieveThumbnailLink = function(filePath, options) {
	var appKey = this.appKey;
	var appSecret = this.appSecret;
	var uid = options.uid;
	var accessToken = options.token;
	return new DropboxConnector().connect(appKey, appSecret, accessToken, uid)
		.then(function(dropboxClient) {
			return dropboxClient.generateThumbnailLink(filePath);
		});
};

DropboxAdapter.prototype.retrieveFileMetadata = function(filePath, options) {
	var appKey = this.appKey;
	var appSecret = this.appSecret;
	var uid = options.uid;
	var accessToken = options.token;
	return new DropboxConnector().connect(appKey, appSecret, accessToken, uid)
		.then(function(dropboxClient) {
			return dropboxClient.retrieveFileMetadata(filePath)
				.then(function(stat) {
					return parseStatModel(stat.json());
				});
		});
};

DropboxAdapter.prototype.getUploadConfig = function(sitePath, options) {
	return {
		name: 'dropbox',
		path: sitePath,
		token: options.token
	};
};


function DropboxConnector() {
}

DropboxConnector.prototype.connect = function(appKey, appSecret, accessToken, uid) {
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

function parseStatModel(statModel, rootPath) {
	rootPath = rootPath || '';
	if (!statModel) { return null; }
	if (statModel.is_deleted) { return null; }
	var fileMetadata = {
		path: statModel.path.replace(rootPath, '') || '/',
		mimeType: statModel.mime_type,
		size: statModel.bytes,
		modified: new Date(statModel.modified),
		readOnly: statModel.read_only,
		thumbnail: statModel.thumb_exists
	};
	if (statModel.is_dir) {
		fileMetadata.directory = true;
		if (statModel.contents) {
			fileMetadata.contents = statModel.contents.map(function(childStatModel) {
				return parseStatModel(childStatModel, rootPath);
			});
		}
	}
	return new FileModel(fileMetadata);
}


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

module.exports = DropboxAdapter;
