'use strict';

var Promise = require('promise');

var HttpError = require('../errors/HttpError');

var DropboxService = require('../services/DropboxService');
var DownloadService = require('../services/DownloadService');
var UserService = require('../services/UserService');
var AuthenticationService = require('../services/AuthenticationService');

var config = require('../../config');

var MONGO_ERROR_CODE_DUPLICATE_KEY = 11000;

var DB_COLLECTION_SITES = 'sites';
var DB_COLLECTION_USERS = 'users';

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
			return createSite(dataService, siteModel);
		});


	function createSite(dataService, siteModel) {
		return new Promise(function(resolve, reject) {
			var options = { safe: true };

			dataService.db.collection(DB_COLLECTION_SITES).insert(siteModel, options,
				function(error, records) {
					if (error && (error.code === MONGO_ERROR_CODE_DUPLICATE_KEY)) {
						return reject(new HttpError(409, 'A site already exists at that path'));
					}
					if (error) { return reject(error); }
					return resolve(siteModel);
				}
			);
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
		return new Promise(function(resolve, reject) {
			var query = { 'user': uid, 'alias': siteAlias, 'users.username': username };
			dataService.db.collection(DB_COLLECTION_SITES).count(query,
				function(error, numRecords) {
					if (error) { return reject(error); }
					var userAlreadyExists = (numRecords > 0);
					return resolve(userAlreadyExists);
				}
			);
		});
	}

	function addSiteUser(dataService, uid, siteAlias, username, password) {
		return new Promise(function(resolve, reject) {
			var authenticationService = new AuthenticationService();
			var userModel = authenticationService.create(username, password);

			var criteria = { 'user': uid, 'alias': siteAlias };
			var updates = { $push: { 'users': userModel } };
			var options = { safe: 1 };

			dataService.db.collection(DB_COLLECTION_SITES).update(criteria, updates, options,
				function(error, numRecords) {
					if (error) { return reject(error); }
					if (numRecords === 0) {
						return reject(new HttpError(404));
					}
					return resolve(userModel);
				}
			);
		});
	}
};

SiteService.prototype.retrieveSite = function(uid, siteAlias, includeContents, includeUsers, includeDomains) {
	var dataService = this.dataService;
	var userService = new UserService(dataService);
	var self = this;
	return retrieveSite(dataService, uid, siteAlias, includeContents, includeUsers, includeDomains)
		.then(function(siteModel) {
			if (!includeContents) { return siteModel; }
			var hasSiteFolder = (siteModel.path !== null);
			if (!hasSiteFolder) { return siteModel; }

			return userService.retrieveUser(uid)
				.then(function(userModel) {
					var accessToken = userModel.token;
					return loadSiteContents(siteModel, accessToken)
						.then(function(folder) {
							siteModel.contents = parseFileModel(folder.contents, siteModel.path);
							delete siteModel.cache;
							self.updateSiteCache(uid, siteAlias, folder.cache);
							return siteModel;
						});
				});
		});


	function retrieveSite(dataService, uid, siteAlias, includeContents, includeUsers, includeDomains) {
		return new Promise(function(resolve, reject) {
			var query = { 'user': uid, 'alias': siteAlias };
			var projection = { '_id': 0 };
			if (!includeUsers) {
				projection.users = 0;
			}
			if (!includeContents) { projection.cache = 0; }
			if (!includeDomains) { projection.domains = 0; }

			dataService.db.collection(DB_COLLECTION_SITES).findOne(query, projection,
				function(error, siteModel) {
					if (error) { return reject(error); }
					if (!siteModel) {
						return reject(new HttpError(404));
					}
					return resolve(siteModel);
				}
			);
		});
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
		var isExternalPath = !rootFolderRegExp.test(path);
		if (isExternalPath) { throw new Error('Invalid file path: "' + path + '"'); }
		return path.replace(rootFolderRegExp, '').split('/').map(encodeURIComponent).join('/');


		function escapeRegExp(string) {
			return string.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, '\\$&');
		}
	}
};

SiteService.prototype.retrieveSiteDownloadLink = function(uid, siteAlias, downloadPath) {
	var dataService = this.dataService;
	var userService = new UserService(dataService);
	return retrieveSiteDropboxPath(uid, siteAlias)
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


	function retrieveSiteDropboxPath(uid, siteAlias) {
		return new Promise(function(resolve, reject) {
			var query = { 'user': uid, 'alias': siteAlias };
			var projection = { 'path': 1 };

			dataService.db.collection(DB_COLLECTION_SITES).findOne(query, projection,
				function(error, siteModel) {
					if (error) { return reject(error); }
					if (!siteModel) {
						return reject(new HttpError(404));
					}
					if (!siteModel.path) {
						return reject(new HttpError(404));
					}

					var sitePath = siteModel.path;
					return resolve(sitePath);
				}
			);
		});
	}
};

SiteService.prototype.retrieveSiteAuthenticationDetails = function(uid, siteAlias) {
	var dataService = this.dataService;
	return retrieveSiteAuthenticationDetails(dataService, uid, siteAlias);


	function retrieveSiteAuthenticationDetails(dataService, uid, siteAlias) {
		return new Promise(function(resolve, reject) {
			var query = { 'user': uid, 'alias': siteAlias };
			var projection = { 'public': 1, 'users': 1 };

			dataService.db.collection(DB_COLLECTION_SITES).findOne(query, projection,
				function(error, siteModel) {
					if (error) { return reject(error); }
					if (!siteModel) {
						return reject(new HttpError(404));
					}

					var authenticationDetails = {
						'public': siteModel.public,
						'users': siteModel.users
					};

					return resolve(authenticationDetails);
				}
			);
		});
	}
};

SiteService.prototype.retrieveSiteCache = function(uid, siteAlias) {
	var dataService = this.dataService;
	return retrieveSiteCache(dataService, uid, siteAlias);


	function retrieveSiteCache(dataService, uid, siteAlias) {
		return new Promise(function(resolve, reject) {
			var query = { 'user': uid, 'alias': siteAlias };
			var projection = { 'cache': 1 };

			dataService.db.collection(DB_COLLECTION_SITES).findOne(query, projection,
				function(error, siteModel) {
					if (!siteModel) {
						return reject(new HttpError(404));
					}
					if (error) { return reject(error); }
					return resolve(siteModel.cache);
				}
			);
		});
	}
};

SiteService.prototype.retrieveSitePathByDomain = function(domain) {
	var dataService = this.dataService;
	return retrieveSitePathByDomain(dataService, domain)
		.then(function(siteModel) {
			if (!siteModel) { return null; }
			var uid = siteModel.user;
			var siteAlias = siteModel.alias;
			var userService = new UserService(dataService);
			return userService.retrieveUser(uid)
				.then(function(userModel) {
					var userAlias = userModel.alias;
					var siteInfo = {
						user: userAlias,
						site: siteAlias
					};
					return siteInfo;
				});
		});


	function retrieveSitePathByDomain(dataService, domain) {
		return new Promise(function(resolve, reject) {
			var criteria = { 'domains': domain };
			var projection = { 'user': 1, 'alias': 1 };
			var options = { limit: 1 };

			dataService.db.collection(DB_COLLECTION_SITES).find(criteria, projection, options,
				function(error, siteModelsCursor) {
					if (error) { return reject(error); }
					siteModelsCursor.toArray(
						function(error, siteModels) {
							if (error) { return reject(error); }
							var siteModel = siteModels[0] || null;
							return resolve(siteModel);
						}
					);
				}
			);
		});
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
		return new Promise(function(resolve, reject) {
			var query = { 'user': uid, 'alias': siteAlias };
			var projection = { 'path': 1 };

			dataService.db.collection(DB_COLLECTION_SITES).findOne(query, projection,
				function(error, siteModel) {
					if (error) { return reject(error); }
					if (!siteModel) {
						return reject(new HttpError(404));
					}
					var sitePath = siteModel.path;
					return resolve(sitePath);
				}
			);
		});
	}

	function updateSite(dataService, uid, siteAlias, fields) {
		return new Promise(function(resolve, reject) {
			var criteria = { 'user': uid, 'alias': siteAlias };
			var updates = { $set: fields };
			var options = { safe: true };

			dataService.db.collection(DB_COLLECTION_SITES).update(criteria, updates, options,
				function(error, numRecords) {
					if (error) { return reject(error); }
					if (numRecords === 0) {
						return reject(new HttpError(404));
					}
					return resolve();
				}
			);
		});
	}
};

SiteService.prototype.updateSiteCache = function(uid, siteAlias, cache) {
	cache = cache || null;
	var dataService = this.dataService;
	return updateSiteCache(dataService, uid, siteAlias, cache);


	function updateSiteCache(dataService, uid, siteAlias, cache) {
		return new Promise(function(resolve, reject) {
			var criteria = { 'user': uid, 'alias': siteAlias };
			var update = { $set: { 'cache': cache } };
			var options = { safe: true };

			dataService.db.collection(DB_COLLECTION_SITES).update(criteria, update, options,
				function(error, numResults) {
					if (error) { return reject(error); }
					if (numResults === 0) {
						return reject(new HttpError(404));
					}
					return resolve();
				}
			);
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
		return new Promise(function(resolve, reject) {
			var criteria = { 'user': uid, 'alias': siteAlias };
			var updates = { $pull: { 'users': { 'username': username } } };
			var options = { safe: true };

			dataService.db.collection(DB_COLLECTION_SITES).update(criteria, updates, options,
				function(error, numRecords) {
					if (error) { return reject(error); }
					if (numRecords === 0) {
						return reject(new HttpError(404));
					}
					return resolve();
				}
			);
		});
	}
};

SiteService.prototype.createSiteDomain = function(uid, siteAlias, domain) {
	if (!uid) { return Promise.reject(new HttpError(400, 'No user specified')); }
	if (!siteAlias) { return Promise.reject(new HttpError(400, 'No site specified')); }
	if (!domain) { return Promise.reject(new HttpError(400, 'No domain specified')); }

	// TODO: Validate site domain details

	var dataService = this.dataService;
	return checkWhetherDomainAlreadyExists(dataService, domain)
		.then(function(domainAlreadyExists) {
			if (domainAlreadyExists) {
				throw new HttpError(409, 'A site is already registered to this domain');
			}
			return addSiteDomain(dataService, uid, siteAlias, domain);
		});


	function checkWhetherDomainAlreadyExists(dataService, domain) {
		return new Promise(function(resolve, reject) {
			var query = { 'domains': domain };
			dataService.db.collection(DB_COLLECTION_SITES).count(query,
				function(error, numRecords) {
					if (error) { return reject(error); }
					var domainAlreadyExists = (numRecords > 0);
					return resolve(domainAlreadyExists);
				}
			);
		});
	}

	function addSiteDomain(dataService, uid, siteAlias, domain) {
		return new Promise(function(resolve, reject) {
			var criteria = { 'user': uid, 'alias': siteAlias };
			var updates = { $push: { 'domains': domain } };
			var options = { safe: 1 };

			dataService.db.collection(DB_COLLECTION_SITES).update(criteria, updates, options,
				function(error, numRecords) {
					if (error) { return reject(error); }
					if (numRecords === 0) {
						return reject(new HttpError(404));
					}
					return resolve(domain);
				}
			);
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
						return resetOrganizationDefaultSite(dataService, uid);
					}
				});
		});

	function checkWhetherSiteisUserDefaultSite(dataService, uid, siteAlias) {
		return new Promise(function(resolve, reject) {
			var query = { 'user': uid, 'default': siteAlias };
			dataService.db.collection(DB_COLLECTION_USERS).count(query,
				function(error, numRecords) {
					if (error) { return reject(error); }
					var isDefaultSite = (numRecords > 0);
					return resolve(isDefaultSite);
				}
			);
		});
	}

	function deleteSite(dataService, uid, siteAlias) {
		return new Promise(function(resolve, reject) {
			var selector = { 'user': uid, 'alias': siteAlias };
			var options = { safe: true };

			dataService.db.collection(DB_COLLECTION_SITES).remove(selector, options,
				function(error, numRecords) {
					if (error) { return reject(error); }
					if (numRecords === 0) {
						return reject(new HttpError(404));
					}
					return resolve();
				}
			);
		});
	}

	function resetOrganizationDefaultSite(dataService, uid) {
		var organizationService = new UserService(dataService);
		return organizationService.updateOrganizationDefaultSiteAlias(uid, null)
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
		return new Promise(function(resolve, reject) {
			var criteria = { 'user': uid, 'alias': siteAlias };
			var updates = { $pull: { 'domains': domain } };
			var options = { safe: true };

			dataService.db.collection(DB_COLLECTION_SITES).update(criteria, updates, options,
				function(error, numRecords) {
					if (error) { return reject(error); }
					if (numRecords === 0) {
						return reject(new HttpError(404));
					}
					return resolve();
				}
			);
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
			'domains': siteModel.domains || [],
			'cache': null
		};
	}
}

module.exports = SiteService;
