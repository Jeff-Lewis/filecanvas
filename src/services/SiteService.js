'use strict';

var mapSeries = require('promise-map-series');
var escapeRegExp = require('escape-regexp');

var HttpError = require('../errors/HttpError');

var DropboxService = require('../services/DropboxService');
var UserService = require('../services/UserService');
var SiteTemplateService = require('../services/SiteTemplateService');
var AuthenticationService = require('../services/AuthenticationService');

var constants = require('../constants');

var DB_COLLECTION_SITES = constants.DB_COLLECTION_SITES;
var DB_COLLECTION_USERS = constants.DB_COLLECTION_USERS;

function SiteService(database, options) {
	options = options || {};
	var host = options.host;
	var appKey = options.appKey;
	var appSecret = options.appKey;
	var accessToken = options.accessToken;

	this.database = database;
	this.host = host;
	this.appKey = appKey;
	this.appSecret = appSecret;
	this.accessToken = accessToken;
}

SiteService.prototype.database = null;

SiteService.prototype.createSite = function(siteModel) {
	var database = this.database;
	var host = this.host;
	var appKey = this.appKey;
	var appSecret = this.appSecret;
	var accessToken = this.accessToken;
	var requireFullModel = true;
	return validateSiteModel(siteModel, requireFullModel)
		.then(function(siteModel) {
			return createSite(database, siteModel)
				.catch(function(error) {
					if (error.code === database.ERROR_CODE_DUPLICATE_KEY) {
						throw new HttpError(409, 'A site already exists at that path');
					}
					throw error;
				});
		})
		.then(function() {
			if (!siteModel.root) { return; }
			var uid = siteModel.user;
			return retrieveUser(database, uid)
				.then(function(userModel) {
					var siteRoot = siteModel.root;
					var context = {
						host: host,
						user: userModel,
						site: siteModel
					};
					return generateSiteFiles(siteRoot, context)
						.then(function(siteFiles) {
							initSiteFolder(appKey, appSecret, accessToken, uid, siteRoot, siteFiles);
						});
				});
		})
		.then(function() {
			return siteModel;
		});
};

SiteService.prototype.retrieveSite = function(uid, siteName, options) {
	options = options || {};
	var onlyPublishedSites = Boolean(options.published);
	var includeContents = Boolean(options.contents);
	var includeUsers = Boolean(options.users);
	var database = this.database;
	var appKey = this.appKey;
	var appSecret = this.appSecret;
	var accessToken = this.accessToken;
	return retrieveSite(database, uid, siteName, {
		published: onlyPublishedSites,
		contents: includeContents,
		users: includeUsers
	})
		.then(function(siteModel) {
			if (!includeContents) { return siteModel; }
			var hasSiteFolder = (siteModel.root !== null);
			if (!hasSiteFolder) { return null; }
			return loadSiteContents(siteModel, appKey, appSecret, accessToken, uid)
				.then(function(folder) {
					updateSiteCache(database, uid, siteName, folder.cache);
					var contents = parseFileModel(folder.contents, siteModel.root);
					siteModel.contents = contents;
					siteModel.cache = folder.cache;
					return siteModel;
				});
		});


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


		function getFileUrl(path, rootFolderPath) {
			var rootFolderRegExp = new RegExp('^' + escapeRegExp(rootFolderPath), 'i');
			var isExternalPath = path.toLowerCase().indexOf(rootFolderPath.toLowerCase()) !== 0;
			if (isExternalPath) { throw new Error('Invalid file path: "' + path + '"'); }
			return path.replace(rootFolderRegExp, '').split('/').map(encodeURIComponent).join('/');
		}
	}
};

SiteService.prototype.updateSite = function(uid, siteName, updates) {
	var database = this.database;
	var requireFullModel = false;
	return validateSiteModel(updates, requireFullModel)
		.then(function(updates) {
			return getSiteRoot(database, uid, siteName)
				.then(function(existingSiteRoot) {
					var siteRootHasChanged = (existingSiteRoot !== updates.root);
					if (!siteRootHasChanged) {
						delete updates.root;
						delete updates.cache;
					}
					return updateSite(database, uid, siteName, updates);
				});
		});
};

SiteService.prototype.deleteSite = function(uid, siteName) {
	if (!uid) { return Promise.reject(new HttpError(400, 'No user specified')); }
	if (!siteName) { return Promise.reject(new HttpError(400, 'No site specified')); }
	var database = this.database;
	return checkWhetherSiteisUserDefaultSite(database, uid, siteName)
		.then(function(isDefaultSite) {
			return deleteSite(database, uid, siteName)
				.then(function() {
					if (isDefaultSite) {
						return resetUserDefaultSite(database, uid);
					}
				});
		});
};

SiteService.prototype.retrieveSiteAuthenticationDetails = function(uid, siteName) {
	var database = this.database;
	return retrieveSiteAuthenticationDetails(database, uid, siteName);
};

SiteService.prototype.retrieveSiteCache = function(uid, siteName) {
	var database = this.database;
	return retrieveSiteCache(database, uid, siteName);
};

SiteService.prototype.updateSiteCache = function(uid, siteName, cache) {
	cache = cache || null;
	var database = this.database;
	return updateSiteCache(database, uid, siteName, cache);
};

SiteService.prototype.retrieveSiteDownloadLink = function(uid, siteName, downloadPath) {
	var database = this.database;
	var appKey = this.appKey;
	var appSecret = this.appSecret;
	var accessToken = this.accessToken;
	return retrieveSiteDropboxPath(database, uid, siteName)
		.then(function(folderPath) {
			return new DropboxService().connect(appKey, appSecret, accessToken)
				.then(function(dropboxClient) {
					var dropboxFilePath = folderPath + '/' + downloadPath;
					return dropboxClient.generateDownloadLink(dropboxFilePath);
				});
		});
};

SiteService.prototype.createSiteUser = function(uid, siteName, authDetails) {
	if (!uid) { return Promise.reject(new HttpError(400, 'No user specified')); }
	if (!siteName) { return Promise.reject(new HttpError(400, 'No site specified')); }
	if (!authDetails) { return Promise.reject(new HttpError(400, 'No auth details specified')); }
	if (!authDetails.username) { return Promise.reject(new HttpError(400, 'No auth username specified')); }
	if (!authDetails.password) { return Promise.reject(new HttpError(400, 'No auth password specified')); }
	var database = this.database;
	return checkWhetherSiteUserAlreadyExists(database, uid, siteName, authDetails.username)
		.then(function(userAlreadyExists) {
			if (userAlreadyExists) {
				throw new HttpError(409, 'A user already exists with this username');
			}
			return createSiteUser(database, uid, siteName, authDetails);
		});
};

SiteService.prototype.updateSiteUser = function(uid, siteName, username, authDetails) {
	if (!uid) { return Promise.reject(new HttpError(400, 'No user specified')); }
	if (!siteName) { return Promise.reject(new HttpError(400, 'No site specified')); }
	if (!username) { return Promise.reject(new HttpError(400, 'No user specified')); }
	if (!authDetails) { return Promise.reject(new HttpError(400, 'No auth details specified')); }
	if (!authDetails.username) { return Promise.reject(new HttpError(400, 'No auth username specified')); }
	if (!authDetails.password) { return Promise.reject(new HttpError(400, 'No auth password specified')); }
	var database = this.database;
	return updateSiteUser(database, uid, siteName, username, authDetails);
};


SiteService.prototype.deleteSiteUser = function(uid, siteName, username) {
	if (!uid) { return Promise.reject(new HttpError(400, 'No user specified')); }
	if (!siteName) { return Promise.reject(new HttpError(400, 'No site specified')); }
	if (!username) { return Promise.reject(new HttpError(400, 'No user specified')); }
	var database = this.database;
	return deleteSiteUser(database, uid, siteName, username);
};

SiteService.prototype.getDropboxFileMetadata = function(uid, filePath) {
	var appKey = this.appKey;
	var appSecret = this.appSecret;
	var accessToken = this.accessToken;
	return getDropboxFileMetadata(appKey, appSecret, accessToken, uid, filePath);
};


function createSite(database, siteModel) {
	return database.collection(DB_COLLECTION_SITES).insertOne(siteModel);
}

function retrieveSite(database, uid, siteName, options) {
	options = options || {};
	var onlyPublishedSites = Boolean(options.published);
	var includeContents = Boolean(options.contents);
	var includeUsers = Boolean(options.users);

	var query = { 'user': uid, 'name': siteName };
	if (onlyPublishedSites) { query['published'] = true; }
	var fields = [
		'user',
		'name',
		'label',
		'template',
		'root',
		'private',
		'published'
	];
	if (includeUsers) { fields.push('users'); }
	if (includeContents) { fields.push('cache'); }
	return database.collection(DB_COLLECTION_SITES).findOne(query, fields)
		.then(function(siteModel) {
			if (!siteModel) { throw new HttpError(404); }
			return siteModel;
		});
}

function updateSite(database, uid, siteName, fields) {
	var filter = { 'user': uid, 'name': siteName };
	var updates = { $set: fields };
	return database.collection(DB_COLLECTION_SITES).updateOne(filter, updates)
		.then(function(error, numRecords) {
			if (numRecords === 0) { throw new HttpError(404); }
			return;
		});
}

function deleteSite(database, uid, siteName) {
	var filter = { 'user': uid, 'name': siteName };
	return database.collection(DB_COLLECTION_SITES).deleteOne(filter)
		.then(function(numRecords) {
			if (numRecords === 0) { throw new HttpError(404); }
			return;
		});
}

function retrieveSiteAuthenticationDetails(database, uid, siteName) {
	var query = { 'user': uid, 'name': siteName };
	var fields = [
		'private',
		'users'
	];
	return database.collection(DB_COLLECTION_SITES).findOne(query, fields)
		.then(function(siteModel) {
			if (!siteModel) { throw new HttpError(404); }
			var authenticationDetails = {
				'private': siteModel.private,
				'users': siteModel.users
			};
			return authenticationDetails;
		});
}

function retrieveSiteDropboxPath(database, uid, siteName) {
	var query = { 'user': uid, 'name': siteName };
	var fields = [
		'root'
	];
	return database.collection(DB_COLLECTION_SITES).findOne(query, fields)
		.then(function(siteModel) {
			if (!siteModel) { throw new HttpError(404); }
			if (!siteModel.root) { throw new HttpError(404); }
			var siteRoot = siteModel.root;
			return siteRoot;
		});
}

function retrieveSiteCache(database, uid, siteName) {
	var query = { 'user': uid, 'name': siteName };
	var fields = [
		'cache'
	];
	return database.collection(DB_COLLECTION_SITES).findOne(query, fields)
		.then(function(siteModel) {
			if (!siteModel) { throw new HttpError(404); }
			var siteCache = siteModel.cache;
			return siteCache;
		});
}

function updateSiteCache(database, uid, siteName, cache) {
	var filter = { 'user': uid, 'name': siteName };
	var updates = { $set: { 'cache': cache } };
	return database.collection(DB_COLLECTION_SITES).updateOne(filter, updates)
		.then(function(error, numRecords) {
			if (numRecords === 0) { throw new HttpError(404); }
			return;
		});
}

function checkWhetherSiteisUserDefaultSite(database, uid, siteName) {
	var query = { 'user': uid, 'defaultSite': siteName };
	return database.collection(DB_COLLECTION_USERS).count(query)
		.then(function(numRecords) {
			var isDefaultSite = (numRecords > 0);
			return isDefaultSite;
		});
}

function resetUserDefaultSite(database, uid) {
	var userService = new UserService(database);
	return userService.updateUserDefaultSiteName(uid, null)
		.then(function(siteName) {
			return;
		});
}

function loadSiteContents(siteModel, appKey, appSecret, accessToken, uid) {
	return new DropboxService().connect(appKey, appSecret, accessToken, uid)
		.then(function(dropboxClient) {
			return dropboxClient.loadFolderContents(siteModel.root, siteModel.cache);
		});
}

function getSiteRoot(database, uid, siteName) {
	var query = { 'user': uid, 'name': siteName };
	var fields = [
		'root'
	];
	return database.collection(DB_COLLECTION_SITES).findOne(query, fields)
		.then(function(siteModel) {
			if (!siteModel) { throw new HttpError(404); }
			var siteRoot = siteModel.root;
			return siteRoot;
		});
}

function checkWhetherSiteUserAlreadyExists(database, uid, siteName, username) {
	var query = { 'user': uid, 'name': siteName, 'users.username': username };
	return database.collection(DB_COLLECTION_SITES).count(query)
		.then(function(numRecords) {
			var userAlreadyExists = (numRecords > 0);
			return userAlreadyExists;
		});
}

function createSiteUser(database, uid, siteName, authDetails) {
	var authenticationService = new AuthenticationService();
	var siteUserModel = authenticationService.create(authDetails.username, authDetails.password);
	var filter = { 'user': uid, 'name': siteName };
	var updates = { $push: { 'users': siteUserModel } };
	return database.collection(DB_COLLECTION_SITES).updateOne(filter, updates)
		.then(function(numRecords) {
			if (numRecords === 0) {
				throw new HttpError(404);
			}
			return siteUserModel;
		});
}

function updateSiteUser(database, uid, siteName, username, authDetails) {
	var authenticationService = new AuthenticationService();
	var siteUserModel = authenticationService.create(authDetails.username, authDetails.password);
	var filter = { 'user': uid, 'name': siteName, 'users.username': username };
	var updates = { $set: { 'users.$': siteUserModel } };
	return database.collection(DB_COLLECTION_SITES).updateOne(filter, updates)
		.then(function(error, numRecords) {
			if (numRecords === 0) { throw new HttpError(404); }
			return;
		});
}

function deleteSiteUser(database, uid, siteName, username) {
	var filter = { 'user': uid, 'name': siteName };
	var updates = { $pull: { 'users': { 'username': username } } };
	return database.collection(DB_COLLECTION_SITES).updateOne(filter, updates)
		.then(function(error, numRecords) {
			if (numRecords === 0) { throw new HttpError(404); }
			return;
		});
}

function retrieveUser(database, uid) {
	return new UserService(database).retrieveUser(uid);
}

function generateSiteFiles(pathPrefix, context) {
	return new SiteTemplateService().generateSiteFiles({
		pathPrefix: pathPrefix,
		context: context
	});
}

function initSiteFolder(appKey, appSecret, accessToken, uid, siteRoot, siteFiles) {
	return new DropboxService().connect(appKey, appSecret, accessToken, uid)
		.then(function(dropboxClient) {
			return checkWhetherFileExists(dropboxClient, siteRoot)
				.then(function(folderExists) {
					if (folderExists) { return; }
					return copySiteFiles(dropboxClient, siteFiles);
				});
		});

	function checkWhetherFileExists(dropboxClient, filePath) {
		return dropboxClient.getFileMetadata(filePath)
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


		function getFileListing(dirContents) {
			var files = Object.keys(dirContents)
				.sort(function(filePath1, filePath2) {
					return (filePath1 < filePath2 ? -1 : 1);
				})
				.map(function(filePath) {
					var file = dirContents[filePath];
					return {
						path: filePath,
						contents: file
					};
				});
			return files;
		}
	}
}

function getDropboxFileMetadata(appKey, appSecret, accessToken, uid, filePath) {
	return new DropboxService().connect(appKey, appSecret, accessToken, uid)
		.then(function(dropboxClient) {
			return dropboxClient.getFileMetadata(filePath)
				.then(function(stat) {
					return stat.json();
				});
		});
}

function validateSiteModel(siteModel, requireFullModel) {
	return new Promise(function(resolve, reject) {
		if (!siteModel) { throw new HttpError(400, 'No site model specified'); }
		if ((requireFullModel || ('user' in siteModel)) && !siteModel.user) { throw new HttpError(400, 'No user specified'); }
		if ((requireFullModel || ('name' in siteModel)) && !siteModel.name) { throw new HttpError(400, 'No site path specified'); }
		if ((requireFullModel || ('label' in siteModel)) && !siteModel.label) { throw new HttpError(400, 'No site name specified'); }
		if ((requireFullModel || ('template' in siteModel)) && !siteModel.template) { throw new HttpError(400, 'No site template specified'); }

		// TODO: Validate organization when validating site model
		// TODO: Validate name when validating site model
		// TODO: Validate label when validating site model
		// TODO: Validate template when validating site model
		// TODO: Validate root when validating site model
		// TODO: Validate home option when validating site model

		resolve(siteModel);
	});
}

module.exports = SiteService;
