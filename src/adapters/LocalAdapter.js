'use strict';

var util = require('util');
var path = require('path');
var fs = require('fs');
var mapSeries = require('promise-map-series');
var express = require('express');
var LocalStrategy = require('passport-local').Strategy;
var mkdirp = require('mkdirp');
var slug = require('slug');
var urlJoin = require('url-join');

var LoginService = require('../services/LoginService');

var LoginAdapter = require('./LoginAdapter');
var StorageAdapter = require('./StorageAdapter');

var AuthenticationService = require('../services/AuthenticationService');

var loadFileMetadata = require('../utils/loadFileMetadata');

var HttpError = require('../errors/HttpError');

function LocalLoginAdapter(database, options) {
	options = options || {};
	var isTemporary = options.temporary || null;
	var authStrategy = options.strategy || null;
	var authOptions = options.options || null;

	if (!authStrategy) { throw new Error('Missing auth strategy'); }
	if (!authOptions) { throw new Error('Missing auth options'); }

	LoginAdapter.call(this, database, {
		temporary: isTemporary
	});

	this.authStrategy = authStrategy;
	this.authOptions = authOptions;
}

util.inherits(LocalLoginAdapter, LoginAdapter);

LocalLoginAdapter.prototype.adapterName = 'local';
LocalLoginAdapter.prototype.authStrategy = null;
LocalLoginAdapter.prototype.authOptions = null;

LocalLoginAdapter.prototype.middleware = function(database, passport, callback) {
	var loginService = new LoginService(database, this);

	var app = express();

	app.post('/', function(req, res, next) {
		passport.authenticate('admin/local', function(error, user, info) {
			if (!error && !user) {
				error = new HttpError(401);
			}
			callback(error, user, info, req, res, next);
		})(req, res, next);
	});

	passport.use('admin/local', new LocalStrategy({ passReqToCallback: true },
		function(req, username, password, callback) {
			var passportValues = {
				username: username,
				password: password
			};
			var query = { 'username': username };
			loginService.login(query, passportValues, { request: req })
				.then(function(userModel) {
					callback(null, userModel);
				})
				.catch(function(error) {
					callback(error);
				});
		})
	);

	return app;
};

LocalLoginAdapter.prototype.authenticate = function(passportValues, userAdapterConfig) {
	var passportUsername = passportValues.username;
	var passportPassword = passportValues.password;

	var authenticationService = new AuthenticationService();
	var validUsers = [
		{
			username: userAdapterConfig.username,
			strategy: userAdapterConfig.strategy,
			password: userAdapterConfig.password
		}
	];
	return authenticationService.authenticate(passportUsername, passportPassword, validUsers)
		.then(function(validUser) {
			return Boolean(validUser);
		});
};

LocalLoginAdapter.prototype.getUserDetails = function(passportValues) {
	var passportUsername = passportValues.username;
	var username = slug(passportUsername, { lower: true });
	var userDetails = {
		username: username
	};
	return Promise.resolve(userDetails);
};

LocalLoginAdapter.prototype.getAdapterConfig = function(passportValues, existingAdapterConfig) {
	var passportUsername = passportValues.username;
	var passportPassword = passportValues.password;
	var authStrategy = this.authStrategy;
	var authOptions = this.authOptions;

	var authenticationService = new AuthenticationService();

	if (existingAdapterConfig) {
		return Promise.resolve(existingAdapterConfig);
	} else {
		return authenticationService.create(passportUsername, passportPassword, authStrategy, authOptions)
			.then(function(authUser) {
				return {
					strategy: authUser.strategy,
					username: authUser.username,
					password: authUser.password
				};
			});
	}
};

LocalLoginAdapter.prototype.unlink = function(userAdapterConfig) {
	return Promise.resolve();
};


function LocalStorageAdapter(database, options) {
	options = options || {};
	var adapterLabel = options.adapterLabel || null;
	var rootLabel = options.rootLabel || null;
	var defaultSitesPath = options.defaultSitesPath || null;
	var sitesRoot = options.sitesRoot || null;
	var downloadUrl = options.download && options.download.url || null;
	var previewUrl = options.preview && options.preview.url || null;
	var thumbnailUrl = options.thumbnail && options.thumbnail.url || null;

	if (!database) { throw new Error('Missing database'); }
	if (!adapterLabel) { throw new Error('Missing adapter label'); }
	if (!rootLabel) { throw new Error('Missing adapter name'); }
	if (!defaultSitesPath) { throw new Error('Missing default sites path'); }
	if (!sitesRoot) { throw new Error('Missing local sites root'); }
	if (!downloadUrl) { throw new Error('Missing local download URL'); }
	if (!previewUrl) { throw new Error('Missing local preview URL'); }
	if (!thumbnailUrl) { throw new Error('Missing local thumbnail URL'); }

	StorageAdapter.call(this);

	this.database = database;
	this.adapterLabel = adapterLabel;
	this.rootLabel = rootLabel;
	this.defaultSitesPath = defaultSitesPath;
	this.sitesRoot = sitesRoot;
	this.downloadUrl = downloadUrl;
	this.previewUrl = previewUrl;
	this.thumbnailUrl = thumbnailUrl;
}

util.inherits(LocalStorageAdapter, StorageAdapter);

LocalStorageAdapter.prototype.adapterName = 'local';
LocalStorageAdapter.prototype.database = null;
LocalStorageAdapter.prototype.adapterLabel = null;
LocalStorageAdapter.prototype.rootLabel = null;
LocalStorageAdapter.prototype.defaultSitesPath = null;
LocalStorageAdapter.prototype.sitesRoot = null;
LocalStorageAdapter.prototype.downloadUrl = null;
LocalStorageAdapter.prototype.previewUrl = null;
LocalStorageAdapter.prototype.thumbnailUrl = null;

LocalStorageAdapter.prototype.getMetadata = function(userAdapterConfig) {
	var adapterLabel = this.adapterLabel;
	var rootLabel = this.rootLabel;
	var defaultSitesPath = this.defaultSitesPath;
	return {
		label: adapterLabel,
		rootLabel: rootLabel,
		path: defaultSitesPath
	};
};

LocalStorageAdapter.prototype.initSiteFolder = function(siteFiles, siteAdapterConfig, userAdapterConfig) {
	var sitesRoot = this.sitesRoot;
	var sitePath = siteAdapterConfig.path;
	return checkWhetherFileExists(sitePath)
		.then(function(folderExists) {
			if (folderExists) { return; }
			return copySiteFiles(sitePath, siteFiles);
		});


	function checkWhetherFileExists(filePath) {
		var fullPath = path.join(sitesRoot, filePath);
		return new Promise(function(resolve, reject) {
			fs.stat(fullPath, function(error, stat) {
				if (error && (error.code === 'ENOENT')) {
					return resolve(false);
				}
				if (error) { return reject(error); }
				var fileExists = Boolean(stat);
				return resolve(fileExists);
			});
		});
	}

	function copySiteFiles(sitePath, dirContents) {
		var files = getFileListing(dirContents);
		return Promise.resolve(mapSeries(files, function(fileMetadata) {
			var filePath = path.join(sitePath, fileMetadata.path);
			var fullPath = path.join(sitesRoot, filePath);
			var fileContents = fileMetadata.contents;
			return writeFile(fullPath, fileContents);
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

		function writeFile(filePath, fileContents) {
			return new Promise(function(resolve, reject) {
				var parentPath = path.dirname(filePath);
				mkdirp(parentPath, function(error) {
					if (error) { return reject(error); }
					var stream = fs.createWriteStream(filePath);
					stream.on('finish', resolve);
					stream.on('error', reject);
					stream.write(fileContents);
					stream.end();
				});
			});
		}
	}
};

LocalStorageAdapter.prototype.loadSiteContents = function(siteAdapterConfig, userAdapterConfig) {
	var sitesRoot = this.sitesRoot;
	var siteFolderPath = siteAdapterConfig.path;
	var fullPath = path.join(sitesRoot, siteFolderPath);
	return loadFileMetadata(fullPath, {
		root: fullPath,
		contents: true
	})
		.then(function(rootFolder) {
			return {
				root: rootFolder,
				cache: null
			};
		});
};

LocalStorageAdapter.prototype.readFile = function(filePath, siteAdapterConfig, userAdapterConfig) {
	var sitesRoot = this.sitesRoot;
	var sitePath = siteAdapterConfig.path;
	var fullPath = path.join(sitesRoot, sitePath, filePath);
	return new Promise(function(resolve, reject) {
		fs.readFile(fullPath, { encoding: 'utf8' }, function(error, data) {
			if (error) { return reject(error); }
			resolve(data);
		});
	});
};

LocalStorageAdapter.prototype.retrieveDownloadLink = function(filePath, siteAdapterConfig, userAdapterConfig) {
	var downloadUrl = this.downloadUrl;
	var sitePath = siteAdapterConfig.path;
	return Promise.resolve(urlJoin(downloadUrl, sitePath, filePath));
};

LocalStorageAdapter.prototype.retrievePreviewLink = function(filePath, siteAdapterConfig, userAdapterConfig) {
	var previewUrl = this.previewUrl;
	var sitePath = siteAdapterConfig.path;
	return Promise.resolve(urlJoin(previewUrl, sitePath, filePath));
};

LocalStorageAdapter.prototype.retrieveThumbnailLink = function(filePath, siteAdapterConfig, userAdapterConfig) {
	var thumbnailUrl = this.thumbnailUrl;
	var sitePath = siteAdapterConfig.path;
	return Promise.resolve(urlJoin(thumbnailUrl, sitePath, filePath));
};

LocalStorageAdapter.prototype.retrieveFileMetadata = function(filePath, userAdapterConfig) {
	var sitesRoot = this.sitesRoot;
	var fullPath = path.resolve(sitesRoot, filePath);
	return loadFileMetadata(fullPath, {
		root: sitesRoot,
		contents: false
	})
		.catch(function(error) {
			if (error.code === 'ENOENT') { return null; }
			throw error;
		});
};

LocalStorageAdapter.prototype.getUploadConfig = function(siteAdapterConfig, userAdapterConfig) {
	return {
		name: this.adapterName,
		config: {
			path: siteAdapterConfig.path
		}
	};
};

module.exports = {
	LoginAdapter: LocalLoginAdapter,
	StorageAdapter: LocalStorageAdapter
};
