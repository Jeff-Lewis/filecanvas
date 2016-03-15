'use strict';

var util = require('util');
var path = require('path');
var express = require('express');
var escapeRegExp = require('escape-regexp');
var objectAssign = require('object-assign');
var slug = require('slug');
var mapSeries = require('promise-map-series');
var Dropbox = require('../../lib/dropbox/dist/dropbox');
var DropboxOAuth2Strategy = require('passport-dropbox-oauth2').Strategy;

var LoginService = require('../services/LoginService');

var LoginAdapter = require('./LoginAdapter');
var StorageAdapter = require('./StorageAdapter');

var FileModel = require('../models/FileModel');

var HttpError = require('../errors/HttpError');

function DropboxLoginAdapter(database, options) {
	options = options || {};
	var isTemporary = options.temporary;
	var appKey = options.appKey;
	var appSecret = options.appSecret;
	var loginCallbackUrl = options.loginCallbackUrl;

	if (!appKey) { throw new Error('Missing Dropbox app key'); }
	if (!appSecret) { throw new Error('Missing Dropbox app secret'); }
	if (!loginCallbackUrl) { throw new Error('Missing login callback URL'); }

	LoginAdapter.call(this, database, {
		temporary: isTemporary
	});

	this.appKey = appKey;
	this.appSecret = appSecret;
	this.loginCallbackUrl = loginCallbackUrl;
}

util.inherits(DropboxLoginAdapter, LoginAdapter);

DropboxLoginAdapter.prototype.adapterName = 'dropbox';
DropboxLoginAdapter.prototype.appKey = null;
DropboxLoginAdapter.prototype.appSecret = null;
DropboxLoginAdapter.prototype.loginCallbackUrl = null;

DropboxLoginAdapter.prototype.middleware = function(database, passport, callback) {
	var appKey = this.appKey;
	var appSecret = this.appSecret;
	var loginCallbackUrl = this.loginCallbackUrl;

	var loginService = new LoginService(database, this);

	var app = express();

	app.post('/', passport.authenticate('admin/dropbox'));
	app.get('/oauth2/callback', function(req, res, next) {
		passport.authenticate('admin/dropbox', function(error, user, info) {
			if (!error && req.query['error']) {
				if (req.query['error'] === 'access_denied') {
					// TODO: Handle use case where user denies access
				}
				error = new HttpError(401, req.query['error_description'] || null);
				error.code = req.query['error'];
			}
			if (error && error.oauthError) {
				var oauthErrorDetails = error.oauthError.data ? JSON.parse(error.oauthError.data) : {};
				error = new HttpError(401, oauthErrorDetails['error_description']);
				error.code = oauthErrorDetails['error'];
			}
			callback(error, user, info, req, res, next);
		})(req, res, next);
	});

	passport.use('admin/dropbox', new DropboxOAuth2Strategy({
			clientID: appKey,
			clientSecret: appSecret,
			callbackURL: loginCallbackUrl,
			passReqToCallback: true
		},
		function(req, accessToken, refreshToken, profile, callback) {
			var passportValues = {
				uid: profile.id,
				token: accessToken,
				refreshToken: refreshToken,
				firstName: profile._json.name_details.given_name,
				lastName: profile._json.name_details.surname,
				email: profile.emails[0].value
			};
			var query = { 'uid': passportValues.uid };
			loginService.login(query, passportValues)
				.then(function(userModel) {
					callback(null, userModel);
				})
				.catch(function(error) {
					callback(error);
				});
		}
	));

	return app;
};

DropboxLoginAdapter.prototype.authenticate = function(passportValues, userAdapterConfig) {
	return Promise.resolve(true);
};

DropboxLoginAdapter.prototype.getUserDetails = function(passportValues) {
	var firstName = passportValues.firstName;
	var lastName = passportValues.lastName;
	var email = passportValues.email;
	var fullName = firstName + ' ' + lastName;
	var username = slug(fullName, { lower: true });
	var userDetails = {
		username: username,
		firstName: firstName,
		lastName: lastName,
		email: email
	};
	return Promise.resolve(userDetails);
};

DropboxLoginAdapter.prototype.getAdapterConfig = function(passportValues, existingAdapterConfig) {
	return Promise.resolve({
		uid: passportValues.uid,
		token: passportValues.token,
		firstName: passportValues.firstName,
		lastName: passportValues.lastName,
		email: passportValues.email
	});
};


function DropboxStorageAdapter(database, options) {
	options = options || {};
	var adapterLabel = options.adapterLabel || null;
	var rootLabel = options.rootLabel || null;
	var defaultSitesPath = options.defaultSitesPath || null;
	var appKey = options.appKey;
	var appSecret = options.appSecret;

	if (!database) { throw new Error('Missing database'); }
	if (!adapterLabel) { throw new Error('Missing adapter label'); }
	if (!rootLabel) { throw new Error('Missing root label'); }
	if (!defaultSitesPath) { throw new Error('Missing sites path'); }
	if (!appKey) { throw new Error('Missing Dropbox app key'); }
	if (!appSecret) { throw new Error('Missing Dropbox app appSecret'); }

	StorageAdapter.call(this);

	this.database = database;
	this.adapterLabel = adapterLabel;
	this.rootLabel = rootLabel;
	this.defaultSitesPath = defaultSitesPath;
	this.appKey = appKey;
	this.appSecret = appSecret;
}

util.inherits(DropboxStorageAdapter, StorageAdapter);

DropboxStorageAdapter.prototype.adapterName = 'dropbox';
DropboxStorageAdapter.prototype.database = null;
DropboxStorageAdapter.prototype.adapterLabel = null;
DropboxStorageAdapter.prototype.rootLabel = null;
DropboxStorageAdapter.prototype.defaultSitesPath = null;
DropboxStorageAdapter.prototype.appKey = null;
DropboxStorageAdapter.prototype.appSecret = null;

DropboxStorageAdapter.prototype.getMetadata = function(userAdapterConfig) {
	var adapterLabel = this.adapterLabel;
	var rootLabel = this.rootLabel;
	var defaultSitesPath = this.defaultSitesPath;
	var fullName = [userAdapterConfig.firstName, userAdapterConfig.lastName].join(' ');
	return {
		label: adapterLabel,
		rootLabel: rootLabel.replace(/\$\{\s*user\s*\}/g, fullName),
		path: defaultSitesPath
	};
};

DropboxStorageAdapter.prototype.initSiteFolder = function(siteFiles, siteAdapterConfig, userAdapterConfig) {
	var appKey = this.appKey;
	var appSecret = this.appSecret;
	var uid = userAdapterConfig.uid;
	var accessToken = userAdapterConfig.token;
	var sitePath = siteAdapterConfig.path;
	return new DropboxConnector(appKey, appSecret)
		.connect(uid, accessToken)
		.then(function(dropboxClient) {
			return checkWhetherFileExists(dropboxClient, sitePath)
				.then(function(folderExists) {
					if (folderExists) { return; }
					return copySiteFiles(dropboxClient, sitePath, siteFiles);
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

	function copySiteFiles(dropboxClient, sitePath, dirContents) {
		var files = getFileListing(dirContents);
		var writeOptions = {};
		return Promise.resolve(mapSeries(files, function(fileMetadata) {
			var filePath = sitePath + '/' + fileMetadata.path;
			var fileContents = fileMetadata.contents;
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

DropboxStorageAdapter.prototype.loadSiteContents = function(siteAdapterConfig, userAdapterConfig) {
	var appKey = this.appKey;
	var appSecret = this.appSecret;
	var uid = userAdapterConfig.uid;
	var accessToken = userAdapterConfig.token;
	var cache = userAdapterConfig.cache;
	var siteFolderPath = siteAdapterConfig.path;
	return new DropboxConnector(appKey, appSecret)
		.connect(uid, accessToken)
		.then(function(dropboxClient) {
			return dropboxClient.loadFolderContents(siteFolderPath, cache);
		})
		.then(function(dropboxContents) {
			var folder = parseStatModel(dropboxContents.data, { root: siteFolderPath });
			return {
				root: folder,
				cache: dropboxContents
			};
		});
};

DropboxStorageAdapter.prototype.readFile = function(filePath, siteAdapterConfig, userAdapterConfig) {
	var appKey = this.appKey;
	var appSecret = this.appSecret;
	var uid = userAdapterConfig.uid;
	var accessToken = userAdapterConfig.token;
	return new DropboxConnector(appKey, appSecret)
		.connect(uid, accessToken)
		.then(function(dropboxClient) {
			var sitePath = siteAdapterConfig.path;
			var fullPath = path.join(sitePath, filePath);
			return dropboxClient.readFile(fullPath);
		});
};

DropboxStorageAdapter.prototype.retrieveDownloadLink = function(filePath, siteAdapterConfig, userAdapterConfig) {
	var appKey = this.appKey;
	var appSecret = this.appSecret;
	var uid = userAdapterConfig.uid;
	var accessToken = userAdapterConfig.token;
	return new DropboxConnector(appKey, appSecret)
		.connect(uid, accessToken)
		.then(function(dropboxClient) {
			var sitePath = siteAdapterConfig.path;
			var fullPath = path.join(sitePath, filePath);
			return dropboxClient.generateDownloadLink(fullPath);
		});
};

DropboxStorageAdapter.prototype.retrievePreviewLink = function(filePath, siteAdapterConfig, userAdapterConfig) {
	var appKey = this.appKey;
	var appSecret = this.appSecret;
	var uid = userAdapterConfig.uid;
	var accessToken = userAdapterConfig.token;
	return new DropboxConnector(appKey, appSecret)
		.connect(uid, accessToken)
		.then(function(dropboxClient) {
			var sitePath = siteAdapterConfig.path;
			var fullPath = path.join(sitePath, filePath);
			return dropboxClient.generatePreviewLink(fullPath);
		});
};

DropboxStorageAdapter.prototype.retrieveThumbnailLink = function(filePath, siteAdapterConfig, userAdapterConfig) {
	var appKey = this.appKey;
	var appSecret = this.appSecret;
	var uid = userAdapterConfig.uid;
	var accessToken = userAdapterConfig.token;
	return new DropboxConnector(appKey, appSecret)
		.connect(uid, accessToken)
		.then(function(dropboxClient) {
			var sitePath = siteAdapterConfig.path;
			var fullPath = path.join(sitePath, filePath);
			return dropboxClient.generateThumbnailLink(fullPath);
		});
};

DropboxStorageAdapter.prototype.retrieveFileMetadata = function(filePath, userAdapterConfig) {
	var appKey = this.appKey;
	var appSecret = this.appSecret;
	var uid = userAdapterConfig.uid;
	var accessToken = userAdapterConfig.token;
	return new DropboxConnector(appKey, appSecret)
		.connect(uid, accessToken)
		.then(function(dropboxClient) {
			return dropboxClient.retrieveFileMetadata(filePath)
				.then(function(stat) {
					return parseStatModel(stat.json(), { root: null });
				});
		});
};

DropboxStorageAdapter.prototype.getUploadConfig = function(siteAdapterConfig, userAdapterConfig) {
	return {
		name: this.adapterName,
		config: {
			path: siteAdapterConfig.path,
			token: userAdapterConfig.token
		}
	};
};


function DropboxConnector(appKey, appSecret) {
	if (!appKey) { return Promise.reject(new Error('No app key specified')); }
	if (!appSecret) { return Promise.reject(new Error('No app secret specified')); }

	this.appKey = appKey;
	this.appSecret = appSecret;
}

DropboxConnector.prototype.appKey = null;
DropboxConnector.prototype.appSecret = null;

DropboxConnector.prototype.connect = function(uid, accessToken) {
	if (!uid) { return Promise.reject(new Error('No user ID specified')); }
	if (!accessToken) { return Promise.reject(new Error('No access token specified')); }

	var appKey = this.appKey;
	var appSecret = this.appSecret;

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

function parseStatModel(statModel, options) {
	options = options || {};
	var rootPath = options.root || '';
	if (!statModel) { return null; }
	if (statModel['is_deleted']) { return null; }
	return parseDropboxFileMetadata(statModel, rootPath);


	function parseDropboxFileMetadata(fileMetadata, rootPath) {
		var filePath = (stripRootPrefix(fileMetadata['path'], rootPath) || '/');
		return new FileModel({
			id: filePath,
			path: filePath,
			mimeType: fileMetadata['mime_type'] || null,
			size: fileMetadata['bytes'],
			modified: new Date(fileMetadata['modified']).toISOString(),
			thumbnail: fileMetadata['thumb_exists'],
			directory: fileMetadata['is_dir'],
			contents: (fileMetadata['contents'] ? fileMetadata['contents'].map(function(childFileMetadata) {
				return parseDropboxFileMetadata(childFileMetadata, rootPath);
			}) : null)
		});


		function stripRootPrefix(filePath, rootPath) {
			return filePath.replace(new RegExp('^' + escapeRegExp(rootPath), 'i'), '');
		}
	}
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

DropboxClient.prototype.createFolder = function(folderPath) {
	var client = this.client;
	return createFolder(client, folderPath);


	function createFolder(client, folderPath) {
		return new Promise(function(resolve, reject) {
			client.mkdir(folderPath, function(error, stat) {
				if (error) { return reject(error); }
				resolve(stat);
			});
		});
	}
};

DropboxClient.prototype.readFile = function(path, options) {
	var client = this.client;
	return readFile(client, path, options);


	function readFile(client, path, options) {
		return new Promise(function(resolve, reject) {
			client.readFile(path, options, function(error, data) {
				if (error) { return reject(error); }
				resolve(data);
			});
		});
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
	var client = this.client;
	return generateDownloadLink(client, filePath);


	function generateDownloadLink(client, filePath) {
		return new Promise(function(resolve, reject) {
			client.makeUrl(filePath, { download: true },
				function(error, shareUrlModel) {
					if (error) { return reject(error); }
					return resolve(shareUrlModel.url);
				}
			);
		});
	}
};

DropboxClient.prototype.generatePreviewLink = function(filePath) {
	var extension = path.extname(filePath);
	var PREVIEW_EXTENSIONS = ['.pdf', '.htm', '.html', '.txt'];
	var canUseDownloadLink = (PREVIEW_EXTENSIONS.indexOf(extension) === -1);
	if (canUseDownloadLink) {
		return this.generateDownloadLink(filePath);
	}
	var client = this.client;
	return generatePreviewLink(client, filePath);


	function generatePreviewLink(client, filePath) {
		return new Promise(function(resolve, reject) {
			client.makeUrl(filePath, { download: false, long: true },
				function(error, shareUrlModel) {
					if (error) { return reject(error); }
					return resolve(shareUrlModel.url + '&raw=1');
				}
			);
		});
	}
};

DropboxClient.prototype.generateThumbnailLink = function(filePath) {
	var thumbnailUrl = this.client.thumbnailUrl(filePath, { format: 'jpeg', size: 'l' });
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

module.exports = {
	LoginAdapter: DropboxLoginAdapter,
	StorageAdapter: DropboxStorageAdapter
};
