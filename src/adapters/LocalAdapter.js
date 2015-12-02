'use strict';

var util = require('util');
var path = require('path');
var fs = require('fs');
var mapSeries = require('promise-map-series');
var express = require('express');
var LocalStrategy = require('passport-local').Strategy;
var mkdirp = require('mkdirp');
var slug = require('slug');

var AuthenticationService = require('../services/AuthenticationService');

var LoginAdapter = require('./LoginAdapter');

var loadFileMetadata = require('../utils/loadFileMetadata');

function LocalLoginAdapter(database, options) {
	options = options || {};
	var isPersistent = options.persistent || null;
	var authStrategy = options.strategy || null;
	var authOptions = options.options || null;

	if (!authStrategy) { throw new Error('Missing auth strategy'); }
	if (!authOptions) { throw new Error('Missing auth options'); }

	LoginAdapter.call(this, database, {
		persistent: isPersistent
	});

	this.authStrategy = authStrategy;
	this.authOptions = authOptions;
}

util.inherits(LocalLoginAdapter, LoginAdapter);

LocalLoginAdapter.prototype.adapterName = 'local';
LocalLoginAdapter.prototype.authStrategy = null;
LocalLoginAdapter.prototype.authOptions = null;

LocalLoginAdapter.prototype.middleware = function(passport, passportOptions, callback) {
	var app = express();

	app.post('/', passport.authenticate('admin/local', passportOptions), callback);

	var self = this;
	passport.use('admin/local', new LocalStrategy({ passReqToCallback: true },
		function(req, username, password, callback) {
			var passportValues = {
				username: username,
				password: password
			};
			var query = { 'username': username };
			self.login(req, query, passportValues, callback);
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


function LocalStorageAdapter(database, options) {
	options = options || {};
	var adapterName = options.adapterName || null;
	var adapterLabel = options.adapterLabel || null;
	var defaultSitesPath = options.defaultSitesPath || null;
	var sitesRoot = options.sitesRoot || null;
	var downloadUrl = options.download && options.download.url || null;
	var thumbnailUrl = options.thumbnail && options.thumbnail.url || null;

	if (!database) { throw new Error('Missing database'); }
	if (!adapterName) { throw new Error('Missing adapter name'); }
	if (!adapterLabel) { throw new Error('Missing adapter label'); }
	if (!defaultSitesPath) { throw new Error('Missing default sites path'); }
	if (!sitesRoot) { throw new Error('Missing local sites root'); }
	if (!downloadUrl) { throw new Error('Missing local download URL'); }
	if (!thumbnailUrl) { throw new Error('Missing local thumbnail URL'); }

	this.database = database;
	this.adapterName = adapterName;
	this.adapterLabel = adapterLabel;
	this.defaultSitesPath = defaultSitesPath;
	this.sitesRoot = sitesRoot;
	this.downloadUrl = downloadUrl;
	this.thumbnailUrl = thumbnailUrl;
}

LocalStorageAdapter.prototype.database = null;
LocalStorageAdapter.prototype.adapterName = null;
LocalStorageAdapter.prototype.adapterLabel = null;
LocalStorageAdapter.prototype.defaultSitesPath = null;
LocalStorageAdapter.prototype.sitesRoot = null;
LocalStorageAdapter.prototype.downloadUrl = null;
LocalStorageAdapter.prototype.thumbnailUrl = null;

LocalStorageAdapter.prototype.getMetadata = function(adapterConfig) {
	var adapterName = this.adapterName;
	var adapterLabel = this.adapterLabel;
	var defaultSitesPath = this.defaultSitesPath;
	return {
		name: adapterName,
		label: adapterLabel,
		path: defaultSitesPath
	};
};

LocalStorageAdapter.prototype.createFolder = function(folderPath, options) {
	var sitesRoot = this.sitesRoot;
	return checkWhetherFileExists(folderPath)
		.then(function(folderExists) {
			if (folderExists) { return; }
			return createFolder(folderPath);
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

	function createFolder(folderPath) {
		var fullPath = path.join(sitesRoot, folderPath);
		return new Promise(function(resolve, reject) {
			mkdirp(fullPath, function(error) {
				if (error) { return reject(error); }
				resolve();
			});
		});
	}
};

LocalStorageAdapter.prototype.initSiteFolder = function(sitePath, siteFiles, options) {
	var sitesRoot = this.sitesRoot;
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

LocalStorageAdapter.prototype.loadFolderContents = function(folderPath, options) {
	var sitesRoot = this.sitesRoot;
	var fullPath = path.join(sitesRoot, folderPath);
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

LocalStorageAdapter.prototype.retrieveFileMetadata = function(filePath, options) {
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

LocalStorageAdapter.prototype.retrieveDownloadLink = function(filePath, options) {
	var downloadUrl = this.downloadUrl;
	return Promise.resolve(downloadUrl + filePath.substr('/'.length));
};

LocalStorageAdapter.prototype.retrieveThumbnailLink = function(filePath, options) {
	var thumbnailUrl = this.thumbnailUrl;
	return Promise.resolve(thumbnailUrl + filePath.substr('/'.length));
};

LocalStorageAdapter.prototype.getUploadConfig = function(sitePath, options) {
	return {
		adapter: 'local',
		path: sitePath
	};
};

module.exports = {
	LoginAdapter: LocalLoginAdapter,
	StorageAdapter: LocalStorageAdapter
};
