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

var LoginAdapter = require('./LoginAdapter');

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

DropboxLoginAdapter.prototype.middleware = function(passport, passportOptions, callback) {
	var appKey = this.appKey;
	var appSecret = this.appSecret;
	var loginCallbackUrl = this.loginCallbackUrl;

	var app = express();

	app.post('/', passport.authenticate('admin/dropbox'));
	app.get('/oauth2/callback', passport.authenticate('admin/dropbox', passportOptions), callback);

	var self = this;
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
			self.login(req, query, passportValues, callback);
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

	this.database = database;
	this.adapterLabel = adapterLabel;
	this.rootLabel = rootLabel;
	this.defaultSitesPath = defaultSitesPath;
	this.appKey = appKey;
	this.appSecret = appSecret;
}

DropboxStorageAdapter.prototype.adapterName = 'dropbox';
DropboxStorageAdapter.prototype.database = null;
DropboxStorageAdapter.prototype.adapterLabel = null;
DropboxStorageAdapter.prototype.rootLabel = null;
DropboxStorageAdapter.prototype.defaultSitesPath = null;
DropboxStorageAdapter.prototype.appKey = null;
DropboxStorageAdapter.prototype.appSecret = null;

DropboxStorageAdapter.prototype.getMetadata = function(adapterConfig) {
	var adapterLabel = this.adapterLabel;
	var rootLabel = this.rootLabel;
	var defaultSitesPath = this.defaultSitesPath;
	var fullName = [adapterConfig.firstName, adapterConfig.lastName].join(' ');
	return {
		label: adapterLabel,
		rootLabel: rootLabel.replace(/\$\{\s*user\s*\}/g, fullName),
		path: defaultSitesPath
	};
};

DropboxStorageAdapter.prototype.createFolder = function(folderPath, options) {
	var appKey = this.appKey;
	var appSecret = this.appSecret;
	var uid = options.uid;
	var accessToken = options.token;
	return new DropboxConnector().connect(appKey, appSecret, uid, accessToken)
		.then(function(dropboxClient) {
			return checkWhetherFileExists(dropboxClient, folderPath)
				.then(function(folderExists) {
					if (folderExists) { return; }
					return createFolder(dropboxClient, folderPath);
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

	function createFolder(dropboxClient, folderPath) {
		return dropboxClient.createFolder(folderPath)
			.then(function() {
				return;
			});
	}
};

DropboxStorageAdapter.prototype.initSiteFolder = function(sitePath, siteFiles, options) {
	var appKey = this.appKey;
	var appSecret = this.appSecret;
	var uid = options.uid;
	var accessToken = options.token;
	return new DropboxConnector().connect(appKey, appSecret, uid, accessToken)
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

DropboxStorageAdapter.prototype.loadFolderContents = function(folderPath, options) {
	var appKey = this.appKey;
	var appSecret = this.appSecret;
	var uid = options.uid;
	var accessToken = options.token;
	var cache = options.cache;
	return new DropboxConnector().connect(appKey, appSecret, uid, accessToken)
		.then(function(dropboxClient) {
			return dropboxClient.loadFolderContents(folderPath, cache);
		})
		.then(function(dropboxContents) {
			var folder = parseStatModel(dropboxContents.data, { root: folderPath });
			return {
				root: folder,
				cache: dropboxContents
			};
		});
};

DropboxStorageAdapter.prototype.readFile = function(filePath, options) {
	var appKey = this.appKey;
	var appSecret = this.appSecret;
	var uid = options.uid;
	var accessToken = options.token;
	return new DropboxConnector().connect(appKey, appSecret, uid, accessToken)
		.then(function(dropboxClient) {
			return dropboxClient.readFile(filePath);
		});
};

DropboxStorageAdapter.prototype.retrieveDownloadLink = function(filePath, options) {
	var appKey = this.appKey;
	var appSecret = this.appSecret;
	var uid = options.uid;
	var accessToken = options.token;
	return new DropboxConnector().connect(appKey, appSecret, uid, accessToken)
		.then(function(dropboxClient) {
			return dropboxClient.generateDownloadLink(filePath);
		});
};

DropboxStorageAdapter.prototype.retrievePreviewLink = function(filePath, options) {
	var appKey = this.appKey;
	var appSecret = this.appSecret;
	var uid = options.uid;
	var accessToken = options.token;
	return new DropboxConnector().connect(appKey, appSecret, uid, accessToken)
		.then(function(dropboxClient) {
			return dropboxClient.generatePreviewLink(filePath);
		});
};

DropboxStorageAdapter.prototype.retrieveThumbnailLink = function(filePath, options) {
	var appKey = this.appKey;
	var appSecret = this.appSecret;
	var uid = options.uid;
	var accessToken = options.token;
	return new DropboxConnector().connect(appKey, appSecret, uid, accessToken)
		.then(function(dropboxClient) {
			return dropboxClient.generateThumbnailLink(filePath);
		});
};

DropboxStorageAdapter.prototype.retrieveFileMetadata = function(filePath, options) {
	var appKey = this.appKey;
	var appSecret = this.appSecret;
	var uid = options.uid;
	var accessToken = options.token;
	return new DropboxConnector().connect(appKey, appSecret, uid, accessToken)
		.then(function(dropboxClient) {
			return dropboxClient.retrieveFileMetadata(filePath)
				.then(function(stat) {
					return parseStatModel(stat.json(), { root: null });
				});
		});
};

DropboxStorageAdapter.prototype.getUploadConfig = function(sitePath, options) {
	return {
		adapter: this.adapterName,
		path: sitePath,
		token: options.token
	};
};


function DropboxConnector() {
}

DropboxConnector.prototype.connect = function(appKey, appSecret, uid, accessToken) {
	if (!appKey) { return Promise.reject(new Error('No app key specified')); }
	if (!appSecret) { return Promise.reject(new Error('No app secret specified')); }
	if (!uid) { return Promise.reject(new Error('No user ID specified')); }
	if (!accessToken) { return Promise.reject(new Error('No access token specified')); }

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
	if (statModel.is_deleted) { return null; }
	return createFileModel(statModel, rootPath);


	function createFileModel(statModel, rootPath) {
		var fileMetadata = {
			id: statModel.path,
			path: stripRootPrefix(statModel.path, rootPath) || '/',
			mimeType: statModel.mime_type || null,
			size: statModel.bytes,
			modified: new Date(statModel.modified).toISOString(),
			thumbnail: statModel.thumb_exists
		};
		if (statModel.is_dir) {
			fileMetadata.directory = true;
			if (statModel.contents) {
				fileMetadata.contents = statModel.contents.map(function(childStatModel) {
					return createFileModel(childStatModel, rootPath);
				});
			}
		}
		return new FileModel(fileMetadata);
	}

	function stripRootPrefix(filePath, rootPath) {
		return filePath.replace(new RegExp('^' + escapeRegExp(rootPath), 'i'), '');
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
