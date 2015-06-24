'use strict';

var Promise = require('promise');

var DownloadService = require('../services/DownloadService');
var OrganizationService = require('../services/OrganizationService');
var AuthenticationService = require('../services/AuthenticationService');

var MONGO_ERROR_CODE_DUPLICATE_KEY = 11000;

var DB_COLLECTION_SITES = 'sites';
var DB_COLLECTION_ORGANIZATIONS = 'organizations';

function SiteService(dataService, dropboxService) {
	this.dataService = dataService;
	this.dropboxService = dropboxService;
	this.downloadService = new DownloadService(dropboxService);
}

SiteService.prototype.dataService = null;
SiteService.prototype.dropboxService = null;

SiteService.prototype.retrieveFolderPath = function(organizationAlias, siteAlias) {
	var dataService = this.dataService;
	return retrieveSiteModel(dataService, organizationAlias, siteAlias)
		.then(function(siteModel) {
			var siteFolderPath = getSiteFolderPath(organizationAlias, siteModel, dataService);
			return siteFolderPath;
		});


	function retrieveSiteModel(dataService, organizationAlias, siteAlias) {
		return new Promise(function(resolve, reject) {
			var query = { 'organization': organizationAlias, 'alias': siteAlias };
			var projection = { '_id': 0, 'public': 0, 'users': 0 };

			dataService.db.collection(DB_COLLECTION_SITES).findOne(query, projection,
				function(error, siteModel) {
					if (error) { return reject(error); }
					return resolve(siteModel);
				}
			);
		});
	}

	function getSiteFolderPath(organizationAlias, siteModel, dataService) {
		var organizationService = new OrganizationService(dataService);
		var organizationShareRoot = organizationService.getOrganizationShareRoot(organizationAlias);
		var sitePath = organizationShareRoot + siteModel.share;
		return sitePath;
	}
};

SiteService.prototype.retrieveDownloadLink = function(organizationAlias, siteAlias, downloadPath) {
	var downloadService = this.downloadService;
	return this.retrieveFolderPath(organizationAlias, siteAlias)
		.then(function(folderPath) {
			var dropboxFilePath = folderPath + '/' + downloadPath;
			return downloadService.retrieveDownloadLink(dropboxFilePath);
		});
};

SiteService.prototype.retrieveAuthenticationDetails = function(organizationAlias, siteAlias) {
	var dataService = this.dataService;
	return retrieveAuthenticationDetails(dataService, organizationAlias, siteAlias);


	function retrieveAuthenticationDetails(dataService, organizationAlias, siteAlias) {
		return new Promise(function(resolve, reject) {
			var query = { 'organization': organizationAlias, 'alias': siteAlias };
			var projection = { 'public': 1, 'users': 1 };

			dataService.db.collection(DB_COLLECTION_SITES).findOne(query, projection,
				function(error, siteModel) {
					if (error) { return reject(error); }
					if (!siteModel) {
						error = new Error();
						error.status = 404;
						return reject(error);
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

SiteService.prototype.retrieveSiteByDomain = function(domain) {
	var dataService = this.dataService;
	return retrieveSiteByDomain(dataService, domain);


	function retrieveSiteByDomain(dataService, domain) {
		return new Promise(function(resolve, reject) {
			var criteria = { 'domains': domain };
			var projection = { 'organization': 1, 'alias': 1 };
			var options = { limit: 1 };

			dataService.db.collection(DB_COLLECTION_SITES).find(criteria, projection, options,
				function(error, siteModelsCursor) {
					if (error) { return reject(error); }
					siteModelsCursor.toArray(onSiteModelsLoaded);


					function onSiteModelsLoaded(error, siteModels) {
						if (error) { return reject(error); }
						var siteModel = siteModels[0] || null;
						return resolve(siteModel);
					}
				}
			);
		});
	}
};

SiteService.prototype.retrieveSite = function(organizationAlias, siteAlias, includeContents, includeUsers, includeDomains) {
	var dataService = this.dataService;
	var dropboxService = this.dropboxService;
	var self = this;
	return retrieveSite(dataService, organizationAlias, siteAlias, includeContents, includeUsers, includeDomains)
		.then(function(siteModel) {
			if (!includeContents) { return siteModel; }

			var siteFolderPath = getSiteFolderPath(organizationAlias, siteModel, dataService);
			var hasSiteFolder = (siteFolderPath !== null);
			if (!hasSiteFolder) { return siteModel; }

			return dropboxService.loadFolderContents(siteFolderPath, siteModel.cache)
				.then(function(data) {
					siteModel.contents = processFileMetadata(data.contents, siteFolderPath);
					delete siteModel.cache;
					self.updateSiteCache(organizationAlias, siteAlias, data.cache);
					return siteModel;
				});
		});


	function retrieveSite(dataService, organizationAlias, siteAlias, includeContents, includeUsers, includeDomains) {
		return new Promise(function(resolve, reject) {
			var query = { 'organization': organizationAlias, 'alias': siteAlias };
			var projection = { '_id': 0 };
			if (!includeUsers) {
				projection['public'] = 0;
				projection.users = 0;
			}
			if (!includeContents) { projection.cache = 0; }
			if (!includeDomains) { projection.domains = 0; }

			dataService.db.collection(DB_COLLECTION_SITES).findOne(query, projection,
				function(error, siteModel) {
					if (error) { return reject(error); }
					if (!siteModel) {
						error = new Error();
						error.status = 404;
						return reject(error);
					}
					return resolve(siteModel);
				}
			);
		});
	}

	function getSiteFolderPath(organizationAlias, siteModel, dataService) {
		var shareAlias = siteModel.share;
		if (!shareAlias) { return null; }
		var organizationService = new OrganizationService(dataService);
		var organizationShareRoot = organizationService.getOrganizationShareRoot(organizationAlias);
		var sitePath = organizationShareRoot + siteModel.share;
		return sitePath;
	}

	function processFileMetadata(fileMetadata, rootFolderPath) {
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
				return processFileMetadata(fileMetadata, rootFolderPath);
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

SiteService.prototype.retrieveSiteCache = function(organizationAlias, siteAlias) {
	var dataService = this.dataService;
	return retrieveSiteCache(dataService, organizationAlias, siteAlias);


	function retrieveSiteCache(dataService, organizationAlias, siteAlias) {
		return new Promise(function(resolve, reject) {
			var query = { 'organization': organizationAlias, 'alias': siteAlias };
			var projection = { 'cache': 1 };

			dataService.db.collection(DB_COLLECTION_SITES).findOne(query, projection,
				function(error, siteModel) {
					if (!siteModel) {
						error = new Error();
						error.status = 404;
						return reject(error);
					}
					if (error) { return reject(error); }
					return resolve(siteModel.cache);
				}
			);
		});
	}
};

SiteService.prototype.updateSiteCache = function(organizationAlias, siteAlias, cache) {
	cache = cache || null;
	var dataService = this.dataService;
	return updateSiteCache(dataService, organizationAlias, siteAlias, cache);


	function updateSiteCache(dataService, organizationAlias, siteAlias, cache) {
		return new Promise(function(resolve, reject) {
			var criteria = { 'organization': organizationAlias, 'alias': siteAlias };
			var update = { $set: { 'cache': cache } };
			var options = { safe: true };

			dataService.db.collection(DB_COLLECTION_SITES).update(criteria, update, options,
				function(error, numResults) {
					if (error) { return reject(error); }
					if (numResults === 0) {
						error = new Error();
						error.status = 404;
						return reject(error);
					}
					return resolve();
				}
			);
		});
	}
};

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
						error = new Error('A site already exists at that path');
						error.status = 409;
						return reject(error);
					}
					if (error) { return reject(error); }
					return resolve(siteModel);
				}
			);
		});
	}
};


SiteService.prototype.updateSite = function(organizationAlias, siteAlias, siteModel) {
	var dataService = this.dataService;
	return parseSiteModel(siteModel)
		.then(function(siteModelFields) {
			return getSiteShareAlias(dataService, organizationAlias, siteAlias)
				.then(function(currentShareAlias) {
					var shareAliasHasChanged = (currentShareAlias !== siteModelFields.share);
					if (!shareAliasHasChanged) {
						delete siteModelFields.share;
						delete siteModelFields.cache;
					}
					// TODO: Handle updating of site users
					delete siteModelFields.users;
					return updateSite(dataService, organizationAlias, siteAlias, siteModelFields);
				});
		});


	function getSiteShareAlias(dataService, organizationAlias, siteAlias) {
		return new Promise(function(resolve, reject) {
			var query = { 'organization': organizationAlias, 'alias': siteAlias };
			var projection = { 'share': 1 };

			dataService.db.collection(DB_COLLECTION_SITES).findOne(query, projection,
				function(error, siteModel) {
					if (error) { return reject(error); }
					if (!siteModel) {
						error = new Error();
						error.status = 404;
						return reject(error);
					}
					var shareAlias = siteModel.share;
					return resolve(shareAlias);
				}
			);
		});
	}

	function updateSite(dataService, organizationAlias, siteAlias, siteModelFields) {
		return new Promise(function(resolve, reject) {
			var criteria = { 'organization': organizationAlias, 'alias': siteAlias };
			var updates = { $set: siteModelFields };
			var options = { safe: true };

			dataService.db.collection(DB_COLLECTION_SITES).update(criteria, updates, options,
				function(error, numRecords) {
					if (error) { return reject(error); }
					if (numRecords === 0) {
						error = new Error();
						error.status = 404;
						return reject(error);
					}
					return resolve(siteModel);
				}
			);
		});
	}
};


SiteService.prototype.createSiteUser = function(organizationAlias, siteAlias, username, password) {
	if (!organizationAlias) { return Promise.reject(validationError('No organization specified')); }
	if (!siteAlias) { return Promise.reject(validationError('No site specified')); }
	if (!username) { return Promise.reject(validationError('No username specified')); }
	if (!password) { return Promise.reject(validationError('No password specified')); }

	// TODO: Validate site user details

	var dataService = this.dataService;
	return checkWhetherUserAlreadyExists(dataService, organizationAlias, siteAlias, username)
		.then(function(userAlreadyExists) {
			if (userAlreadyExists) {
				var error = new Error('A user already exists with this username');
				error.status = 409;
				throw error;
			}
			return addSiteUser(dataService, organizationAlias, siteAlias, username, password);
		});


	function checkWhetherUserAlreadyExists(dataService, organizationAlias, siteAlias, username) {
		return new Promise(function(resolve, reject) {
			var query = { 'organization': organizationAlias, 'alias': siteAlias, 'users.username': username };
			dataService.db.collection(DB_COLLECTION_SITES).count(query,
				function(error, numRecords) {
					if (error) { return reject(error); }
					var userAlreadyExists = (numRecords > 0);
					return resolve(userAlreadyExists);
				}
			);
		});
	}

	function addSiteUser(dataService, organizationAlias, siteAlias, username, password) {
		return new Promise(function(resolve, reject) {
			var authenticationService = new AuthenticationService();
			var userModel = authenticationService.create(username, password);

			var criteria = { 'organization': organizationAlias, 'alias': siteAlias };
			var updates = { $push: { 'users': userModel } };
			var options = { safe: 1 };

			dataService.db.collection(DB_COLLECTION_SITES).update(criteria, updates, options,
				function(error, numRecords) {
					if (error) { return reject(error); }
					if (numRecords === 0) {
						error = new Error();
						error.status = 404;
						return reject(error);
					}
					return resolve(userModel);
				}
			);
		});
	}
};


SiteService.prototype.deleteSiteUser = function(organizationAlias, siteAlias, username) {
	if (!organizationAlias) { return Promise.reject(validationError('No organization specified')); }
	if (!siteAlias) { return Promise.reject(validationError('No site specified')); }
	if (!username) { return Promise.reject(validationError('No user specified')); }

	var dataService = this.dataService;
	return deleteSiteUser(dataService, organizationAlias, siteAlias, username);


	function deleteSiteUser(dataService, organizationAlias, shareAlias, username, callback) {
		return new Promise(function(resolve, reject) {
			var criteria = { 'organization': organizationAlias, 'alias': siteAlias };
			var updates = { $pull: { 'users': { 'username': username } } };
			var options = { safe: true };

			dataService.db.collection(DB_COLLECTION_SITES).update(criteria, updates, options,
				function(error, numRecords) {
					if (error) { return reject(error); }
					if (numRecords === 0) {
						error = new Error();
						error.status = 404;
						return reject(error);
					}
					return resolve();
				}
			);
		});
	}
};


SiteService.prototype.createSiteDomain = function(organizationAlias, siteAlias, domain) {
	if (!organizationAlias) { return Promise.reject(validationError('No organization specified')); }
	if (!siteAlias) { return Promise.reject(validationError('No site specified')); }
	if (!domain) { return Promise.reject(validationError('No domain specified')); }

	// TODO: Validate site domain details

	var dataService = this.dataService;
	return checkWhetherDomainAlreadyExists(dataService, domain)
		.then(function(domainAlreadyExists) {
			if (domainAlreadyExists) {
				var error = new Error('A site is already registered to this domain');
				error.status = 409;
				throw error;
			}
			return addSiteDomain(dataService, organizationAlias, siteAlias, domain);
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

	function addSiteDomain(dataService, organizationAlias, siteAlias, domain) {
		return new Promise(function(resolve, reject) {
			var criteria = { 'organization': organizationAlias, 'alias': siteAlias };
			var updates = { $push: { 'domains': domain } };
			var options = { safe: 1 };

			dataService.db.collection(DB_COLLECTION_SITES).update(criteria, updates, options,
				function(error, numRecords) {
					if (error) { return reject(error); }
					if (numRecords === 0) {
						error = new Error();
						error.status = 404;
						return reject(error);
					}
					return resolve(domain);
				}
			);
		});
	}
};


SiteService.prototype.deleteSiteDomain = function(organizationAlias, siteAlias, domain) {
	if (!organizationAlias) { return Promise.reject(validationError('No organization specified')); }
	if (!siteAlias) { return Promise.reject(validationError('No site specified')); }
	if (!domain) { return Promise.reject(validationError('No domain specified')); }

	var dataService = this.dataService;
	return deleteSiteDomain(dataService, organizationAlias, siteAlias, domain);


	function deleteSiteDomain(dataService, organizationAlias, shareAlias, domain) {
		return new Promise(function(resolve, reject) {
			var criteria = { 'organization': organizationAlias, 'alias': siteAlias };
			var updates = { $pull: { 'domains': domain } };
			var options = { safe: true };

			dataService.db.collection(DB_COLLECTION_SITES).update(criteria, updates, options,
				function(error, numRecords) {
					if (error) { return reject(error); }
					if (numRecords === 0) {
						error = new Error();
						error.status = 404;
						return reject(error);
					}
					return resolve();
				}
			);
		});
	}
};


SiteService.prototype.deleteSite = function(organizationAlias, siteAlias) {
	if (!organizationAlias) { return Promise.reject(validationError('No organization specified')); }
	if (!siteAlias) { return Promise.reject(validationError('No site specified')); }

	// TODO: Validate site delete requests

	var dataService = this.dataService;
	return checkWhetherSiteisOrganizationDefaultSite(dataService, organizationAlias, siteAlias)
		.then(function(isDefaultSite) {
			return deleteSite(dataService, organizationAlias, siteAlias)
				.then(function() {
					if (isDefaultSite) {
						return resetOrganizationDefaultSite(dataService, organizationAlias);
					}
				});
		});


	function checkWhetherSiteisOrganizationDefaultSite(dataService, organizationAlias, siteAlias) {
		return new Promise(function(resolve, reject) {
			var query = { 'alias': organizationAlias, 'default': siteAlias };
			dataService.db.collection(DB_COLLECTION_ORGANIZATIONS).count(query,
				function(error, numRecords) {
					if (error) { return reject(error); }
					var isDefaultSite = (numRecords > 0);
					return resolve(isDefaultSite);
				}
			);
		});
	}

	function deleteSite(dataService, organizationAlias, siteAlias) {
		return new Promise(function(resolve, reject) {
			var selector = { 'organization': organizationAlias, 'alias': siteAlias };
			var options = { safe: true };

			dataService.db.collection(DB_COLLECTION_SITES).remove(selector, options,
				function(error, numRecords) {
					if (error) { return reject(error); }
					if (numRecords === 0) {
						error = new Error();
						error.status = 404;
						return reject(error);
					}
					return resolve();
				}
			);
		});
	}

	function resetOrganizationDefaultSite(dataService, organizationAlias) {
		var organizationService = new OrganizationService(dataService);
		return organizationService.updateOrganizationDefaultSiteAlias(organizationAlias, null)
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
			if (!siteModel) { throw validationError('No site model specified'); }
			if (!siteModel.organization) { throw validationError('No organization specified'); }
			if (!siteModel.alias) { throw validationError('No site alias specified'); }
			if (!siteModel.name) { throw validationError('No site name specified'); }
			if (!siteModel.title) { throw validationError('No site title specified'); }
			if (!siteModel.template) { throw validationError('No site template specified'); }

			// TODO: Validate organization when validating site model
			// TODO: Validate alias when validating site model
			// TODO: Validate name when validating site model
			// TODO: Validate title when validating site model
			// TODO: Validate template when validating site model
			// TODO: Validate share when validating site model

			resolve(siteModel);
		});
	}

	function parseModelFields(siteModel) {
		return {
			'organization': siteModel.organization,
			'alias': siteModel.alias,
			'name': siteModel.name,
			'title': siteModel.title,
			'template': siteModel.template,
			'share': siteModel.share || null,
			'public': Boolean(siteModel['public']),
			'users': siteModel.users || [],
			'cache': null
		};
	}
}

function validationError(message) {
	var error = new Error(message);
	error.status = 400;
	return error;
}

module.exports = SiteService;
