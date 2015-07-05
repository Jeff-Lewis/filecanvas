'use strict';

var Promise = require('promise');
var mapSeries = require('promise-map-series');
var escapeRegExp = require('escape-regexp');

var HttpError = require('../errors/HttpError');

var DropboxService = require('../services/DropboxService');
var DownloadService = require('../services/DownloadService');
var UserService = require('../services/UserService');
var AuthenticationService = require('../services/AuthenticationService');

var config = require('../../config');

var DB_COLLECTION_SITES = config.db.collections.sites;
var DB_COLLECTION_USERS = config.db.collections.users;

var DROPBOX_APP_KEY = config.dropbox.appKey;
var DROPBOX_APP_SECRET = config.dropbox.appSecret;

function SiteService(dataService) {
	this.dataService = dataService;
}

SiteService.prototype.dataService = null;

SiteService.prototype.createSite = function(siteModel, accessToken) {
	var dataService = this.dataService;
	return parseSiteModel(siteModel)
		.then(function(siteModel) {
			return createSite(siteModel)
				.catch(function(error) {
					if (error.code === dataService.ERROR_CODE_DUPLICATE_KEY) {
						throw new HttpError(409, 'A site already exists at that path');
					}
					throw error;
				});
		})
		.then(function() {
			if (!siteModel.path) { return; }
			var uid = siteModel.user;
			var sitePath = siteModel.path;
			var siteContents = config.site.files;
			return initSiteFolder(uid, accessToken, sitePath, siteContents);
		})
		.then(function() {
			return siteModel;
		});


	function createSite(siteModel) {
		return dataService.collection(DB_COLLECTION_SITES).insertOne(siteModel);
	}

	function initSiteFolder(uid, accessToken, sitePath, siteContents) {
		var appKey = DROPBOX_APP_KEY;
		var appSecret = DROPBOX_APP_SECRET;
		var dropboxService = new DropboxService();
		return dropboxService.connect(appKey, appSecret, accessToken, uid)
			.then(function(client) {
				return copySiteFiles(sitePath, siteContents);
			});


		function copySiteFiles(sitePath, dirContents) {
			var files = getFileListing(dirContents, sitePath);
			var writeOptions = {};
			return Promise.resolve(mapSeries(files, function(fileMetaData) {
				var filePath = fileMetaData.path;
				var fileContents = fileMetaData.contents;
				return dropboxService.writeFile(filePath, fileContents, writeOptions);
			}).then(function(results) {}));


			function getFileListing(dirContents, pathPrefix) {
				var files = Object.keys(dirContents).reduce(function(files, filename) {
					var file = dirContents[filename];
					var filePath = pathPrefix + '/' + filename;
					var isFile = file instanceof Buffer || file instanceof String;
					if (isFile) {
						files.push({
							path: filePath,
							contents: file
						});
					} else {
						var childDirContents = file;
						var childDirPath = filePath;
						var childDirFiles = getFileListing(childDirContents, childDirPath);
						files = files.concat(childDirFiles);
					}
					return files;
				}, []);
				return files;
			}
		}
	}
};

SiteService.prototype.createSiteUser = function(uid, siteAlias, username, password) {
	if (!uid) { return Promise.reject(new HttpError(400, 'No user specified')); }
	if (!siteAlias) { return Promise.reject(new HttpError(400, 'No site specified')); }
	if (!username) { return Promise.reject(new HttpError(400, 'No username specified')); }
	if (!password) { return Promise.reject(new HttpError(400, 'No password specified')); }

	// TODO: Validate site user details

	var dataService = this.dataService;
	return checkWhetherUserAlreadyExists(dataService, uid, siteAlias, username)
		.then(function(userAlreadyExists) {
			if (userAlreadyExists) {
				throw new HttpError(409, 'A user already exists with this username');
			}
			return addSiteUser(dataService, uid, siteAlias, username, password);
		});


	function checkWhetherUserAlreadyExists(dataService, uid, siteAlias, username) {
		var query = { 'user': uid, 'alias': siteAlias, 'users.username': username };
		return dataService.collection(DB_COLLECTION_SITES).count(query)
			.then(function(numRecords) {
				var userAlreadyExists = (numRecords > 0);
				return userAlreadyExists;
			});
	}

	function addSiteUser(dataService, uid, siteAlias, username, password) {
		var authenticationService = new AuthenticationService();
		var userModel = authenticationService.create(username, password);
		var filter = { 'user': uid, 'alias': siteAlias };
		var updates = { $push: { 'users': userModel } };
		return dataService.collection(DB_COLLECTION_SITES).updateOne(filter, updates)
			.then(function(numRecords) {
				if (numRecords === 0) {
					throw new HttpError(404);
				}
				return userModel;
			});
	}
};

SiteService.prototype.retrieveSite = function(uid, siteAlias, includeContents, includeUsers) {
	var dataService = this.dataService;
	var userService = new UserService(dataService);
	var self = this;
	return retrieveSite(dataService, uid, siteAlias, includeContents, includeUsers)
		.then(function(siteModel) {
			if (!includeContents) { return siteModel; }

			var hasSiteFolder = (siteModel.path !== null);
			if (!hasSiteFolder) { return null; }

			return userService.retrieveUser(uid)
				.then(function(userModel) {
					var accessToken = userModel.token;
					return loadSiteContents(siteModel, accessToken, uid)
						.then(function(folder) {
							self.updateSiteCache(uid, siteAlias, folder.cache);
							var contents = parseFileModel(folder.contents, siteModel.path);
							siteModel.contents = contents;
							siteModel.cache = folder.cache;
							return siteModel;
						});
				});
		});


	function retrieveSite(dataService, uid, siteAlias, includeContents, includeUsers) {
		var query = { 'user': uid, 'alias': siteAlias };
		var fields = [
			'user',
			'alias',
			'name',
			'title',
			'template',
			'path',
			'public'
		];
		if (includeUsers) { fields.push('users'); }
		if (includeContents) { fields.push('cache'); }
		return dataService.collection(DB_COLLECTION_SITES).findOne(query, fields)
			.then(function(siteModel) {
				if (!siteModel) { throw new HttpError(404); }
				return siteModel;
			});
	}

	function loadSiteContents(siteModel, accessToken, uid) {
		var appKey = DROPBOX_APP_KEY;
		var appSecret = DROPBOX_APP_SECRET;
		var dropboxService = new DropboxService();
		return dropboxService.connect(appKey, appSecret, accessToken, uid)
			.then(function(client) {
				return dropboxService.loadFolderContents(siteModel.path, siteModel.cache);
			});
	}

	function parseFileModel(fileMetadata, rootFolderPath) {
		if (!fileMetadata) { return null; }

		fileMetadata.url = getFileUrl(fileMetadata.path, rootFolderPath);

		Object.defineProperty(fileMetadata, 'folders', {
			'get': function() {
				if (!this.contents) { return null; }
				var folders = this.contents.filter(function(fileModel) {
					return fileModel.is_dir;
				});
				var sortedFolders = folders.sort(function sortAlphabetically(a, b) {
					return (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1);
				});
				return sortedFolders;
			}
		});

		Object.defineProperty(fileMetadata, 'files', {
			'get': function() {
				if (!this.contents) { return null; }
				var files = this.contents.filter(function(fileModel) {
					return !fileModel.is_dir;
				});
				var sortedFiles = files.sort(function sortByDate(a, b) {
					return (a.modifiedAt - b.modifiedAt);
				});
				return sortedFiles;
			}
		});

		if (fileMetadata.is_dir) {
			fileMetadata.contents = fileMetadata.contents.map(function(fileMetadata) {
				return parseFileModel(fileMetadata, rootFolderPath);
			});
		}

		return fileMetadata;
	}

	function getFileUrl(path, rootFolderPath) {
		var rootFolderRegExp = new RegExp('^' + escapeRegExp(rootFolderPath), 'i');
		var isExternalPath = path.toLowerCase().indexOf(rootFolderPath.toLowerCase()) !== 0;
		if (isExternalPath) { throw new Error('Invalid file path: "' + path + '"'); }
		return path.replace(rootFolderRegExp, '').split('/').map(encodeURIComponent).join('/');
	}
};

SiteService.prototype.retrieveSiteDownloadLink = function(uid, siteAlias, downloadPath) {
	var dataService = this.dataService;
	var userService = new UserService(dataService);
	return retrieveSiteDropboxPath(dataService, uid, siteAlias)
		.then(function(folderPath) {
			return userService.retrieveUser(uid)
				.then(function(userModel) {
					var accessToken = userModel.token;
					var appKey = DROPBOX_APP_KEY;
					var appSecret = DROPBOX_APP_SECRET;
					var dropboxService = new DropboxService();
					return dropboxService.connect(appKey, appSecret, accessToken)
						.then(function(client) {
							var downloadService = new DownloadService(dropboxService);
							var dropboxFilePath = folderPath + '/' + downloadPath;
							return downloadService.retrieveDownloadLink(dropboxFilePath);
						});
				});
		});


	function retrieveSiteDropboxPath(dataService, uid, siteAlias) {
		var query = { 'user': uid, 'alias': siteAlias };
		var fields = [
			'path'
		];
		return dataService.collection(DB_COLLECTION_SITES).findOne(query, fields)
			.then(function(siteModel) {
				if (!siteModel) { throw new HttpError(404); }
				if (!siteModel.path) { throw new HttpError(404); }
				var sitePath = siteModel.path;
				return sitePath;
			});
	}
};

SiteService.prototype.retrieveSiteAuthenticationDetails = function(uid, siteAlias) {
	var dataService = this.dataService;
	return retrieveSiteAuthenticationDetails(dataService, uid, siteAlias);


	function retrieveSiteAuthenticationDetails(dataService, uid, siteAlias) {
		var query = { 'user': uid, 'alias': siteAlias };
		var fields = [
			'public',
			'users'
		];
		return dataService.collection(DB_COLLECTION_SITES).findOne(query, fields)
			.then(function(siteModel) {
				if (!siteModel) { throw new HttpError(404); }
				var authenticationDetails = {
					'public': siteModel.public,
					'users': siteModel.users
				};
				return authenticationDetails;
			});
	}
};

SiteService.prototype.retrieveSiteCache = function(uid, siteAlias) {
	var dataService = this.dataService;
	return retrieveSiteCache(dataService, uid, siteAlias);


	function retrieveSiteCache(dataService, uid, siteAlias) {
		var query = { 'user': uid, 'alias': siteAlias };
		var fields = [
			'cache'
		];
		return dataService.collection(DB_COLLECTION_SITES).findOne(query, fields)
			.then(function(siteModel) {
				if (!siteModel) { throw new HttpError(404); }
				var siteCache = siteModel.cache;
				return siteCache;
			});
	}
};

SiteService.prototype.updateSite = function(uid, siteAlias, updates) {
	var dataService = this.dataService;
	return parseSiteModel(updates)
		.then(function(updates) {
			return getSitePath(dataService, uid, siteAlias)
				.then(function(existingSitePath) {
					var sitePathHasChanged = (existingSitePath !== updates.path);
					if (!sitePathHasChanged) {
						delete updates.path;
						delete updates.cache;
					}
					// TODO: Handle updating of site users
					delete updates.users;
					return updateSite(dataService, uid, siteAlias, updates);
				});
		});


	function getSitePath(dataService, uid, siteAlias) {
		var query = { 'user': uid, 'alias': siteAlias };
		var fields = [
			'path'
		];
		return dataService.collection(DB_COLLECTION_SITES).findOne(query, fields)
			.then(function(siteModel) {
				if (!siteModel) { throw new HttpError(404); }
				var sitePath = siteModel.path;
				return sitePath;
			});
	}

	function updateSite(dataService, uid, siteAlias, fields) {
		var filter = { 'user': uid, 'alias': siteAlias };
		var updates = { $set: fields };
		return dataService.collection(DB_COLLECTION_SITES).updateOne(filter, updates)
			.then(function(error, numRecords) {
				if (numRecords === 0) { throw new HttpError(404); }
			});
	}
};

SiteService.prototype.updateSiteCache = function(uid, siteAlias, cache) {
	cache = cache || null;
	var dataService = this.dataService;
	return updateSiteCache(dataService, uid, siteAlias, cache);


	function updateSiteCache(dataService, uid, siteAlias, cache) {
		var filter = { 'user': uid, 'alias': siteAlias };
		var updates = { $set: { 'cache': cache } };
		return dataService.collection(DB_COLLECTION_SITES).updateOne(filter, updates)
			.then(function(error, numRecords) {
				if (numRecords === 0) { throw new HttpError(404); }
			});
	}
};


SiteService.prototype.deleteSiteUser = function(uid, siteAlias, username) {
	if (!uid) { return Promise.reject(new HttpError(400, 'No user specified')); }
	if (!siteAlias) { return Promise.reject(new HttpError(400, 'No site specified')); }
	if (!username) { return Promise.reject(new HttpError(400, 'No user specified')); }

	var dataService = this.dataService;
	return deleteSiteUser(dataService, uid, siteAlias, username);


	function deleteSiteUser(dataService, uid, shareAlias, username, callback) {
		var filter = { 'user': uid, 'alias': siteAlias };
		var updates = { $pull: { 'users': { 'username': username } } };
		return dataService.collection(DB_COLLECTION_SITES).updateOne(filter, updates)
			.then(function(error, numRecords) {
				if (numRecords === 0) { throw new HttpError(404); }
			});
	}
};


SiteService.prototype.deleteSite = function(uid, siteAlias) {
	if (!uid) { return Promise.reject(new HttpError(400, 'No user specified')); }
	if (!siteAlias) { return Promise.reject(new HttpError(400, 'No site specified')); }

	// TODO: Validate site delete requests

	var dataService = this.dataService;
	return checkWhetherSiteisUserDefaultSite(dataService, uid, siteAlias)
		.then(function(isDefaultSite) {
			return deleteSite(dataService, uid, siteAlias)
				.then(function() {
					if (isDefaultSite) {
						return resetUserDefaultSite(dataService, uid);
					}
				});
		});

	function checkWhetherSiteisUserDefaultSite(dataService, uid, siteAlias) {
		var query = { 'user': uid, 'default': siteAlias };
		return dataService.collection(DB_COLLECTION_USERS).count(query)
			.then(function(numRecords) {
				var isDefaultSite = (numRecords > 0);
				return isDefaultSite;
			});
	}

	function deleteSite(dataService, uid, siteAlias) {
		var filter = { 'user': uid, 'alias': siteAlias };
		return dataService.collection(DB_COLLECTION_SITES).deleteOne(filter)
			.then(function(numRecords) {
				if (numRecords === 0) { throw new HttpError(404); }
			});
	}

	function resetUserDefaultSite(dataService, uid) {
		var userService = new UserService(dataService);
		return userService.updateUserDefaultSiteAlias(uid, null)
			.then(function(siteAlias) {});
	}
};

function parseSiteModel(siteModel) {
	return validateSiteModel(siteModel)
		.then(function(siteModel) {
			var parsedModelFields = parseModelFields(siteModel);
			return parsedModelFields;
		});


	function validateSiteModel(siteModel) {
		return new Promise(function(resolve, reject) {
			if (!siteModel) { throw new HttpError(400, 'No site model specified'); }
			if (!siteModel.user) { throw new HttpError(400, 'No user specified'); }
			if (!siteModel.alias) { throw new HttpError(400, 'No site alias specified'); }
			if (!siteModel.name) { throw new HttpError(400, 'No site name specified'); }
			if (!siteModel.title) { throw new HttpError(400, 'No site title specified'); }
			if (!siteModel.template) { throw new HttpError(400, 'No site template specified'); }

			// TODO: Validate organization when validating site model
			// TODO: Validate alias when validating site model
			// TODO: Validate name when validating site model
			// TODO: Validate title when validating site model
			// TODO: Validate template when validating site model
			// TODO: Validate path when validating site model

			resolve(siteModel);
		});
	}

	function parseModelFields(siteModel) {
		return {
			'user': siteModel.user,
			'alias': siteModel.alias,
			'name': siteModel.name,
			'title': siteModel.title,
			'template': siteModel.template,
			'path': siteModel.path || null,
			'public': Boolean(siteModel['public']),
			'users': siteModel.users || [],
			'cache': null
		};
	}
}

module.exports = SiteService;
