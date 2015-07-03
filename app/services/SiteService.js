'use strict';

var Promise = require('promise');
var escapeRegExp = require('escape-regexp');

var HttpError = require('../errors/HttpError');

var DropboxService = require('../services/DropboxService');
var DownloadService = require('../services/DownloadService');
var UserService = require('../services/UserService');
var AuthenticationService = require('../services/AuthenticationService');

var config = require('../../config');

var DB_COLLECTION_SITES = config.db.collections.sites;
var DB_COLLECTION_DOMAINS = config.db.collections.domains;
var DB_COLLECTION_USERS = config.db.collections.users;

var DROPBOX_APP_KEY = config.dropbox.appKey;
var DROPBOX_APP_SECRET = config.dropbox.appSecret;

function SiteService(dataService) {
	this.dataService = dataService;
}

SiteService.prototype.dataService = null;

SiteService.prototype.createSite = function(siteModel) {
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
		});


	function createSite(siteModel) {
		return dataService.collection(DB_COLLECTION_SITES).insertOne(siteModel)
			.then(function() {
				return siteModel;
			});
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

SiteService.prototype.createSiteDomain = function(uid, siteAlias, domain) {
	if (!uid) { return Promise.reject(new HttpError(400, 'No user specified')); }
	if (!siteAlias) { return Promise.reject(new HttpError(400, 'No site specified')); }
	if (!domain) { return Promise.reject(new HttpError(400, 'No domain specified')); }

	// TODO: Validate site domain details

	var dataService = this.dataService;
	var domainModel = {
		name: domain,
		user: uid,
		site: siteAlias
	};
	return createSiteDomain(dataService, domainModel)
		.catch(function(error) {
			if (error.code === dataService.ERROR_CODE_DUPLICATE_KEY) {
				throw new HttpError(409, 'A site is already registered to this domain');
			}
			throw error;
		});


	function createSiteDomain(dataService, domainModel) {
		return dataService.collection(DB_COLLECTION_DOMAINS).insertOne(domainModel)
			.then(function() {
				return domainModel;
			});
	}
};

SiteService.prototype.retrieveSite = function(uid, siteAlias, includeContents, includeUsers, includeDomains) {
	var dataService = this.dataService;
	var userService = new UserService(dataService);
	var self = this;
	return retrieveSite(dataService, uid, siteAlias, includeContents, includeUsers)
		.then(function(siteModel) {
			if (!includeDomains) { return siteModel; }
			return retrieveSiteDomains(dataService, uid, siteAlias)
				.then(function(domainModels) {
					var domainNames = domainModels.map(function(domainModel) {
						return domainModel.name;
					});
					siteModel.domains = domainNames;
					return siteModel;
				});
		})
		.then(function(siteModel) {
			if (!includeContents) { return siteModel; }

			var hasSiteFolder = (siteModel.path !== null);
			if (!hasSiteFolder) { return null; }

			return userService.retrieveUser(uid)
				.then(function(userModel) {
					var accessToken = userModel.token;
					return loadSiteContents(siteModel, accessToken)
						.then(function(folder) {
							self.updateSiteCache(uid, siteAlias, folder.cache);
							var contents = parseFileModel(folder.contents, siteModel.path);
							siteModel.contents = contents;
							siteModel.cache = folder.cache;
							return siteModel;
						});
				});
		});


	function retrieveSite(dataService, uid, siteAlias, includeContents, includeUsers, includeDomains) {
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

	function retrieveSiteDomains(dataService, uid, siteAlias) {
		var filter = { 'user': uid, 'site': siteAlias };
		var fields = [
			'name',
			'user',
			'site'
		];
		return dataService.collection(DB_COLLECTION_DOMAINS).find(filter, fields);
	}

	function loadSiteContents(siteModel, accessToken) {
		var appKey = DROPBOX_APP_KEY;
		var appSecret = DROPBOX_APP_SECRET;
		var dropboxService = new DropboxService();
		return dropboxService.connect(appKey, appSecret, accessToken)
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

SiteService.prototype.retrieveSitePathByDomain = function(domain) {
	var dataService = this.dataService;
	return retrieveDomain(dataService, domain)
		.then(function(domainModel) {
			if (!domainModel) { return null; }
			var uid = domainModel.user;
			var siteAlias = domainModel.site;
			var userService = new UserService(dataService);
			return userService.retrieveUser(uid)
				.then(function(userModel) {
					var userAlias = userModel.alias;
					var sitePath = {
						user: userAlias,
						site: siteAlias
					};
					return sitePath;
				});
		});


	function retrieveDomain(dataService, domain) {
		var query = { 'name': domain };
		var fields = [
			'name',
			'user',
			'site'
		];
		return dataService.collection(DB_COLLECTION_DOMAINS).findOne(query, fields);
	}
};

SiteService.prototype.updateSite = function(uid, siteAlias, updates) {
	var dataService = this.dataService;
	return parseSiteModel(updates)
		.then(function(updates) {
			return getSitePath(dataService, uid, siteAlias)
				.then(function(currentSitePath) {
					var sitePathHasChanged = (currentSitePath !== updates.path);
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
					return deleteSiteDomains(dataService, uid, siteAlias);
				})
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

	function deleteSiteDomains(dataService, uid, siteAlias) {
		var filter = { 'user': uid, 'site': siteAlias };
		return dataService.collection(DB_COLLECTION_DOMAINS).deleteMany(filter)
			.then(function(numRecords) {});
	}

	function resetUserDefaultSite(dataService, uid) {
		var userService = new UserService(dataService);
		return userService.updateUserDefaultSiteAlias(uid, null)
			.then(function(siteAlias) {});
	}
};


SiteService.prototype.deleteSiteDomain = function(uid, siteAlias, domain) {
	if (!uid) { return Promise.reject(new HttpError(400, 'No user specified')); }
	if (!siteAlias) { return Promise.reject(new HttpError(400, 'No site specified')); }
	if (!domain) { return Promise.reject(new HttpError(400, 'No domain specified')); }

	var dataService = this.dataService;
	return deleteSiteDomain(dataService, uid, siteAlias, domain);


	function deleteSiteDomain(dataService, uid, shareAlias, domain) {
		var filter = { 'name': domain, 'user': uid, 'site': siteAlias };
		return dataService.collection(DB_COLLECTION_DOMAINS).deleteOne(filter)
			.then(function(numRecords) {
				if (numRecords === 0) { throw new HttpError(404); }
			});
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
