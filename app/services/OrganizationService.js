'use strict';

var DB_COLLECTION_ORGANIZATIONS = 'organizations';
var DB_COLLECTION_ADMINISTRATORS = 'administrators';
var DB_COLLECTION_DROPBOX_USERS = 'dropboxUsers';
var DB_COLLECTION_SITES = 'sites';

var Promise = require('promise');

var config = require('../../config');

var HttpError = require('../errors/HttpError');

var AuthenticationService = require('../services/AuthenticationService');

var DROPBOX_ROOT = config.dropbox.appRoot;
var ORGANIZATION_SHARE_ROOT_FORMAT = DROPBOX_ROOT + '${ORGANIZATION}/';

var MONGO_ERROR_CODE_DUPLICATE_KEY = 11000;

function OrganizationService(dataService) {
	this.dataService = dataService;
}

OrganizationService.prototype.dataService = null;

OrganizationService.prototype.getOrganizationShareRoot = function(organizationAlias) {
	return ORGANIZATION_SHARE_ROOT_FORMAT.replace(/\$\{ORGANIZATION\}/, organizationAlias);
};

OrganizationService.prototype.retrieveAdministrator = function(administratorUsername) {
	var self = this;
	return new Promise(function(resolve, reject) {
		var query = { 'username': administratorUsername };

		self.dataService.db.collection(DB_COLLECTION_ADMINISTRATORS).findOne(query,
			function(error, adminstratorModel) {
				if (error) { return reject(error); }
				if (!adminstratorModel) {
					return reject(new HttpError(404));
				}
				return resolve(adminstratorModel);
			}
		);
	});
};

OrganizationService.prototype.retrieveOrganizationAdministrators = function(organizationAlias) {
	var dataService = this.dataService;
	return retrieveOrganizationAdministrators(dataService, organizationAlias);


	function retrieveOrganizationAdministrators(dataService, organizationAlias) {
		return new Promise(function(resolve, reject) {
			var query = (organizationAlias ? { 'organization': organizationAlias } : null);

			dataService.db.collection(DB_COLLECTION_ADMINISTRATORS).find(query,
				function(error, administratorModelsCursor) {
					if (error) { return reject(error); }
					administratorModelsCursor.toArray(onAdministratorsLoaded);

					function onAdministratorsLoaded(error, adminstratorModels) {
						if (error) { return reject(error); }
						return resolve(adminstratorModels);
					}
				}
			);
		});
	}
};

OrganizationService.prototype.retrieveOrganizationAdministrator = function(organizationAlias, username) {
	var dataService = this.dataService;
	return retrieveOrganizationAdministrator(dataService, organizationAlias, username);


	function retrieveOrganizationAdministrator(dataService, organizationAlias, username) {
		return new Promise(function(resolve, reject) {
			var query = { 'organization': organizationAlias, 'username': username };
			var projection = { 'organization': 1, 'username': 1, 'email': 1, 'name': 1 };

			dataService.db.collection(DB_COLLECTION_ADMINISTRATORS).findOne(query, projection,
				function(error, administratorModel) {
					if (error) { return reject(error); }
					if (!administratorModel) {
						return reject(new HttpError(404));
					}
					return resolve(administratorModel);
				}
			);
		});
	}
};

OrganizationService.prototype.retrieveOrganization = function(organizationAlias, includeShares) {
	var dataService = this.dataService;
	return retrieveOrganization(dataService, organizationAlias, includeShares);


	function retrieveOrganization(dataService, organizationAlias, includeShares) {
		return new Promise(function(resolve, reject) {
			var query = { 'alias': organizationAlias };
			var projection = {};
			if (!includeShares) { projection.shares = 0; }

			dataService.db.collection(DB_COLLECTION_ORGANIZATIONS).findOne(query, projection,
				function(error, organizationModel) {
					if (error) { return reject(error); }
					if (!organizationModel) {
						return reject(new HttpError(404));
					}
					return resolve(organizationModel);
				}
			);
		});
	}
};

OrganizationService.prototype.updateOrganization = function(organizationAlias, organizationModel) {
	if (!organizationAlias) { return Promise.reject(new HttpError(400, 'No organization specified')); }
	if (!organizationModel) { return Promise.reject(new HttpError(400, 'No organization model specified')); }

	var dataService = this.dataService;
	var organizationAliasHasChanged = (('alias' in organizationModel) && (organizationAlias !== organizationModel.alias));
	return updateOrganization(dataService, organizationAlias, organizationModel)
		.then(function(organizationModel) {
			if (organizationAliasHasChanged) {
				var oldOrganizationAlias = organizationAlias;
				var newOrganizationAlias = organizationModel.alias;
				return updateAdministratorsCollection(dataService, oldOrganizationAlias, newOrganizationAlias)
					.then(function() {
						return updateDropboxUsersCollection(dataService, oldOrganizationAlias, newOrganizationAlias);
					})
					.then(function() {
						return updateSitesCollection(dataService, oldOrganizationAlias, newOrganizationAlias);
					})
					.then(function() {
						return organizationModel;
					});
			} else {
				return organizationModel;
			}
		});


	function updateOrganization(dataService, organizationAlias, organizationModel) {
		return new Promise(function(resolve, reject) {
			var criteria = { 'alias': organizationAlias };
			var updates = { $set: organizationModel };
			var options = { safe: true };

			dataService.db.collection(DB_COLLECTION_ORGANIZATIONS).update(criteria, updates, options,
				function(error, numRecords) {
					if (error) { return reject(error); }
					if (numRecords === 0) {
						return reject(new HttpError(404));
					}
					return resolve(organizationModel);
				}
			);
		});
	}

	function updateAdministratorsCollection(dataService, oldOrganizationAlias, newOrganizationAlias) {
		return new Promise(function(resolve, reject) {
			var criteria = { 'organization': oldOrganizationAlias };
			var updates = { $set: { 'organization': newOrganizationAlias } };
			var options = { safe: true };

			dataService.db.collection(DB_COLLECTION_ADMINISTRATORS).update(criteria, updates, options,
				function(error, numRecords) {
					if (error) { return reject(error); }
					return resolve(newOrganizationAlias);
				}
			);
		});
	}

	function updateDropboxUsersCollection(dataService, oldOrganizationAlias, newOrganizationAlias) {
		return new Promise(function(resolve, reject) {
			var criteria = { 'organization': oldOrganizationAlias };
			var updates = { $set: { 'organization': newOrganizationAlias } };
			var options = { safe: true };

			dataService.db.collection(DB_COLLECTION_DROPBOX_USERS).update(criteria, updates, options,
				function(error, numRecords) {
					if (error) { return reject(error); }
					return resolve(newOrganizationAlias);
				}
			);
		});
	}

	function updateSitesCollection(dataService, oldOrganizationAlias, newOrganizationAlias) {
		return new Promise(function(resolve, reject) {
			var criteria = { 'organization': oldOrganizationAlias };
			var updates = { $set: { 'organization': newOrganizationAlias } };
			var options = { safe: true };

			dataService.db.collection(DB_COLLECTION_SITES).update(criteria, updates, options,
				function(error, numRecords) {
					if (error) { return reject(error); }
					return resolve(newOrganizationAlias);
				}
			);
		});
	}
};

OrganizationService.prototype.retrieveOrganizationSites = function(organizationAlias) {
	var dataService = this.dataService;
	return retrieveOrganizationSites(dataService, organizationAlias);


	function retrieveOrganizationSites(dataService, organizationAlias) {
		return new Promise(function(resolve, reject) {
			var query = { 'organization': organizationAlias };
			var projection = { '_id': 0, 'public': 0, 'users': 0, 'cache': 0 };

			dataService.db.collection(DB_COLLECTION_SITES).find(query, projection,
				function(error, siteModelsCursor) {
					if (error) { return reject(error); }
					siteModelsCursor.toArray(onSiteModelsLoaded);

					function onSiteModelsLoaded(error, siteModels) {
						if (error) { return reject(error); }
						return resolve(siteModels);
					}
				}
			);
		});
	}
};

OrganizationService.prototype.retrieveOrganizationDefaultSiteAlias = function(organizationAlias) {
	var dataService = this.dataService;
	return retrieveOrganizationDefaultSiteAlias(dataService, organizationAlias);


	function retrieveOrganizationDefaultSiteAlias(dataService, organizationAlias) {
		return new Promise(function(resolve, reject) {
			var query = { 'alias': organizationAlias };
			var projection = { 'default': 1 };

			dataService.db.collection(DB_COLLECTION_ORGANIZATIONS).findOne(query, projection,
				function(error, organizationModel) {
					if (error) { return reject(error); }
					if (!organizationModel) {
						return reject(new HttpError(404));
					}
					var defaultSiteAlias = organizationModel['default'];
					return resolve(defaultSiteAlias);
				}
			);
		});
	}
};

OrganizationService.prototype.updateOrganizationDefaultSiteAlias = function(organizationAlias, siteAlias) {
	if (!organizationAlias) { return Promise.reject(new HttpError(400, 'No organization specified')); }
	if (!organizationAlias) { return Promise.reject(new HttpError(400, 'No site specified')); }

	var dataService = this.dataService;
	return updateOrganizationDefaultSiteAlias(dataService, organizationAlias, siteAlias);


	function updateOrganizationDefaultSiteAlias(dataService, organizationAlias, siteAlias) {
		return new Promise(function(resolve, reject) {
			var criteria = { 'alias': organizationAlias };
			var updates = { $set: { 'default': siteAlias } };
			var options = { 'safe': true };

			dataService.db.collection(DB_COLLECTION_ORGANIZATIONS).update(criteria, updates, options,
				function(error, numRecords) {
					if (error) { return reject(error); }
					if (numRecords === 0) {
						return reject(new HttpError(404));
					}
					return resolve(siteAlias);
				}
			);
		});
	}
};

OrganizationService.prototype.retrieveDropboxAccountOrganization = function(dropboxEmail) {
	var dataService = this.dataService;
	return retrieveDropboxAccountOrganization(dataService, dropboxEmail);


	function retrieveDropboxAccountOrganization(dataService, dropboxEmail) {
		return new Promise(function(resolve, reject) {
			var query = { 'email': dropboxEmail };
			var projection = { 'organization': 1 };

			dataService.db.collection(DB_COLLECTION_DROPBOX_USERS).findOne(query, projection,
				function(error, dropboxUserModel) {
					if (error) { return reject(error); }
					if (!dropboxUserModel) {
						return reject(new HttpError(404));
					}
					var organizationAlias = dropboxUserModel.organization;
					return resolve(organizationAlias);
				}
			);
		});
	}
};

OrganizationService.prototype.retrieveOrganizationShares = function(organizationAlias) {
	var dataService = this.dataService;
	return retrieveOrganizationShares(dataService, organizationAlias);


	function retrieveOrganizationShares(dataService, organizationAlias) {
		return new Promise(function(resolve, reject) {
			var query = { 'alias': organizationAlias };
			var projection = { 'shares': 1 };

			dataService.db.collection(DB_COLLECTION_ORGANIZATIONS).findOne(query, projection,
				function(error, organizationModel) {
					if (error) { return reject(error); }
					if (!organizationModel) {
						return reject(new HttpError(404));
					}
					var shareModels = organizationModel.shares;
					return resolve(shareModels);
				}
			);
		});
	}
};

OrganizationService.prototype.createOrganizationShare = function(organizationAlias, shareModel) {
	if (!organizationAlias) { return Promise.reject(new HttpError(400, 'No organization specified')); }
	if (!shareModel) { return Promise.reject(new HttpError(400, 'No share model specified')); }
	if (!shareModel.alias) { return Promise.reject(new HttpError(400, 'No share alias specified')); }
	if (!shareModel.name) { return Promise.reject(new HttpError(400, 'No share name specified')); }

	var dataService = this.dataService;
	return createOrganizationShare(dataService, organizationAlias, shareModel);


	function createOrganizationShare(dataService, organizationAlias, shareModel) {
		return new Promise(function(resolve, reject) {

			// TODO: Validate alias when creating share
			// TODO: Validate name when creating share

			var shareModelFields = {
				'alias': shareModel.alias,
				'name': shareModel.name
			};

			var query = { 'username': organizationAlias };
			var updates = { $push: { 'shares': shareModelFields } };
			var options = { safe: true };

			dataService.db.collection(DB_COLLECTION_ORGANIZATIONS).update(query, updates, options,
				function(error, numRecords) {
					if (error) { return reject(error); }
					if (numRecords === 0) {
						return reject(new HttpError(404));
					}
					return resolve(shareModelFields);
				}
			);
		});
	}
};

OrganizationService.prototype.deleteOrganizationShare = function(organizationAlias, shareAlias) {
	if (!organizationAlias) { return Promise.reject(new HttpError(400, 'No organization specified')); }
	if (!shareAlias) { return Promise.reject(new HttpError(400, 'No share specified')); }

	var dataService = this.dataService;
	return scanForSitesThatAreUsingShare(dataService, organizationAlias, shareAlias)
		.then(function(sitesUsingShare) {
			if (sitesUsingShare && (sitesUsingShare.length > 0)) {
				// TODO: Return proper confirmation page for when dropbox folder is currently in use
				throw new HttpError(403, 'Dropbox folder is currently being used by the following sites: "' + sitesUsingShare.join('", "') + '"');
			}
			return deleteOrganizationShare(dataService, organizationAlias, shareAlias);
		});


	function scanForSitesThatAreUsingShare(dataService, organizationAlias, shareAlias) {
		return new Promise(function(resolve, reject) {
			var query = { 'organization': organizationAlias, 'share': shareAlias };
			var projection = { 'alias': 1 };

			dataService.db.collection(DB_COLLECTION_SITES).find(query, projection,
				function(error, organizationModelsCursor) {
					if (error) { return reject(error); }
					organizationModelsCursor.toArray(onOrganizationModelsLoaded);


					function onOrganizationModelsLoaded(error, organizationModels) {
						if (error) { return reject(error); }
						var organizationAliases = organizationModels.map(function(organizationModel) {
							return organizationModel.alias;
						});
						return resolve(organizationAliases);
					}
				}
			);
		});
	}

	function deleteOrganizationShare(dataService, organizationAlias, shareAlias) {
		return new Promise(function(resolve, reject) {
			var criteria = { 'alias': organizationAlias };
			var updates = { $pull: { 'shares': { 'alias': shareAlias } } };
			var options = { safe: true };

			dataService.db.collection(DB_COLLECTION_ORGANIZATIONS).update(criteria, updates, options,
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

OrganizationService.prototype.createOrganizationAdministrator = function(administratorModel) {
	var dataService = this.dataService;
	var requireFullModel = true;
	return parseAdministratorModel(administratorModel, requireFullModel)
		.then(function(administratorModelFields) {
			return createOrganizationAdministrator(dataService, administratorModelFields);
		});


	function createOrganizationAdministrator(dataService, administratorModelFields) {
		return new Promise(function(resolve, reject) {
			var options = { safe: true };

			dataService.db.collection(DB_COLLECTION_ADMINISTRATORS).insert(administratorModelFields, options,
				function(error, records) {
					if (error && (error.code === MONGO_ERROR_CODE_DUPLICATE_KEY)) {
						return reject(new HttpError(409, 'A user already exists with that username'));
					}
					if (error) { return reject(error); }
					return resolve(administratorModelFields);
				}
			);
		});
	}
};

OrganizationService.prototype.updateOrganizationAdministrator = function(organizationAlias, username, administratorModel) {
	var dataService = this.dataService;
	var requireFullModel = false;
	return parseAdministratorModel(administratorModel, requireFullModel)
		.then(function(administratorModelFields) {
			return updateOrganizationAdministrator(dataService, organizationAlias, username, administratorModelFields);
		});


	function updateOrganizationAdministrator(dataService, organizationAlias, username, administratorModelFields) {
		return new Promise(function(resolve, reject) {
			var criteria = { 'organization': organizationAlias, 'username': username };
			var updates = { $set: administratorModelFields };
			var options = { safe: true };

			dataService.db.collection(DB_COLLECTION_ADMINISTRATORS).update(criteria, updates, options,
				function(error, numRecords) {
					if (error && (error.code === MONGO_ERROR_CODE_DUPLICATE_KEY)) {
						return reject(new HttpError(409, 'A user already exists with that username'));
					}
					if (error) { return reject(error); }
					if (numRecords === 0) {
						return reject(new HttpError(404));
					}
					return resolve(administratorModelFields);
				}
			);
		});
	}
};

OrganizationService.prototype.updateOrganizationAdministratorPassword = function(organizationAlias, username, currentPassword, administratorModel) {
	var dataService = this.dataService;
	var requireFullModel = false;
	return parseAdministratorModel(administratorModel, requireFullModel)
		.then(function(administratorModelFields) {
			return loadCurrentOrganizationAdministratorAuthenticationDetails(dataService, organizationAlias, username)
				.then(function(authenticationDetails) {
					var isCurrentPasswordCorrect = checkPassword(username, currentPassword, authenticationDetails);
					if (!isCurrentPasswordCorrect) {
						throw new HttpError(403, 'Current password was entered incorrectly');
					}
					return updateOrganizationAdministratorPassword(dataService, organizationAlias, username, administratorModelFields);
				});
		});


	function checkPassword(username, password, authenticationDetails) {
		var authenticationService = new AuthenticationService();
		var validUsers = [authenticationDetails];
		return authenticationService.authenticate(username, password, validUsers);
	}

	function loadCurrentOrganizationAdministratorAuthenticationDetails(dataService, organizationAlias, username) {
		return new Promise(function(resolve, reject) {
			var query = { 'organization': organizationAlias, 'username': username };
			var projection = { 'username': 1, 'password': 1, 'salt': 1 };

			dataService.db.collection(DB_COLLECTION_ADMINISTRATORS).findOne(query, projection,
				function (error, authenticationDetails) {
					if (error) { return reject(error); }
					if (!authenticationDetails) {
						return reject(new HttpError(404));
					}
					return resolve(authenticationDetails);
				}
			);
		});
	}

	function updateOrganizationAdministratorPassword(dataService, organizationAlias, username, administratorModelFields) {
		return new Promise(function(resolve, reject) {
			var criteria = { 'organization': organizationAlias, 'username': username };
			var updates = { $set: administratorModelFields };
			var options = { safe: true };

			dataService.db.collection(DB_COLLECTION_ADMINISTRATORS).update(criteria, updates, options,
				function(error, numRecords) {
					if (error && (error.code === MONGO_ERROR_CODE_DUPLICATE_KEY)) {
						return reject(new HttpError(409, 'A user already exists with that username'));
					}
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

OrganizationService.prototype.deleteOrganizationAdministrator = function(organizationAlias, username) {
	if (!organizationAlias) { return Promise.reject(new HttpError(400, 'No organization specified')); }
	if (!username) { return Promise.reject(new HttpError(400, 'No username specified')); }

	var dataService = this.dataService;
	return deleteOrganizationAdministrator(dataService, organizationAlias, username);


	function deleteOrganizationAdministrator(dataService, organizationAlias, username) {
		return new Promise(function(resolve, reject) {
			var selector = { 'organization': organizationAlias, 'username': username };
			var options = { safe: true };

			dataService.db.collection(DB_COLLECTION_ADMINISTRATORS).remove(selector, options,
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

function parseAdministratorModel(administratorModel, requireFullModel) {
	return validateAdministratorModel(administratorModel, requireFullModel)
		.then(function(administratorModel) {
			var parsedModelFields = parseModelFields(administratorModel);
			return parsedModelFields;
		});


	function validateAdministratorModel(administratorModel, requireFullModel) {
		return new Promise(function(resolve, reject) {
			if (!administratorModel) { throw new HttpError(400, 'No user specified'); }
			if ((requireFullModel || ('organization' in administratorModel)) && !administratorModel.organization) { throw new HttpError(400, 'No organization specified'); }
			if ((requireFullModel || ('username' in administratorModel)) && !administratorModel.username) { throw new HttpError(400, 'No username specified'); }
			if ((requireFullModel || ('email' in administratorModel)) && !administratorModel.email) { throw new HttpError(400, 'No email specified'); }
			if ((requireFullModel || ('password' in administratorModel)) && !administratorModel.password) { throw new HttpError(400, 'No password specified'); }
			if ((requireFullModel || ('name' in administratorModel)) && !administratorModel.name) { throw new HttpError(400, 'No name specified'); }

			// TODO: Validate organization when validating administrator model
			// TODO: Validate username when validating administrator model
			// TODO: Validate email when validating administrator model
			// TODO: Validate password when validating administrator model
			// TODO: Validate name when validating administrator model

			return resolve(administratorModel);
		});
	}

	function parseModelFields(administratorModel) {
		var administratorModelFields = {};
		if ('organization' in administratorModel) { administratorModelFields.organization = administratorModel.organization; }
		if ('email' in administratorModel) { administratorModelFields.email = administratorModel.email; }
		if ('name' in administratorModel) { administratorModelFields.name = administratorModel.name; }
		if ('username' in administratorModel) { administratorModelFields.username = administratorModel.username; }
		if ('password' in administratorModel) {
			if (!administratorModel.username) { throw new HttpError(400, 'No username specified'); }
			var authenticationService = new AuthenticationService();
			var authenticationDetails = authenticationService.create(administratorModel.username, administratorModel.password);
			administratorModelFields.password = authenticationDetails.password;
			administratorModelFields.salt = authenticationDetails.salt;
		}
		return administratorModelFields;
	}
}

module.exports = OrganizationService;
