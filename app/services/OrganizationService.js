module.exports = (function() {
	'use strict';

	var DB_COLLECTION_ORGANIZATIONS = 'organizations';
	var DB_COLLECTION_ADMINISTRATORS = 'administrators';
	var DB_COLLECTION_DROPBOX_USERS = 'dropboxUsers';
	var DB_COLLECTION_SITES = 'sites';

	var config = require('../../config');
	
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


	OrganizationService.prototype.retrieveAdministrator = function(administratorUsername, callback) {
		var query = { 'username': administratorUsername };

		this.dataService.db.collection(DB_COLLECTION_ADMINISTRATORS).findOne(query,
			function(error, adminstratorModel) {
				if (error) { return callback && callback(error); }
				if (!adminstratorModel) {
					error = new Error();
					error.status = 404;
					return callback && callback(error);
				}
				return callback && callback(null, adminstratorModel);
			}
		);
	};

	OrganizationService.prototype.retrieveOrganizationAdministrators = function(organizationAlias, callback) {
		var query = (organizationAlias ? { 'organization': organizationAlias } : null);

		this.dataService.db.collection(DB_COLLECTION_ADMINISTRATORS).find(query,
			function(error, administratorModelsCursor) {
				if (error) { return callback && callback(error); }
				administratorModelsCursor.toArray(_handleAdministratorsLoaded);

				function _handleAdministratorsLoaded(error, adminstratorModels) {
					if (error) { return callback && callback(error); }
					return callback && callback(null, adminstratorModels);
				}
			}
		);
	};

	OrganizationService.prototype.retrieveOrganizationAdministrator = function(organizationAlias, username, callback) {
		var query = { 'organization': organizationAlias, 'username': username };
		var projection = { 'organization': 1, 'username': 1, 'email': 1, 'name': 1 };

		this.dataService.db.collection(DB_COLLECTION_ADMINISTRATORS).findOne(query, projection,
			function(error, administratorModel) {
				if (error) { return callback && callback(error); }
				if (!administratorModel) {
					error = new Error();
					error.status = 404;
					return callback && callback(error);
				}
				return callback && callback(null, administratorModel);
			}
		);
	};

	OrganizationService.prototype.retrieveOrganization = function(organizationAlias, includeShares, callback) {
		var query = { 'alias': organizationAlias };
		var projection = {};
		if (!includeShares) { projection.shares = 0; }

		this.dataService.db.collection(DB_COLLECTION_ORGANIZATIONS).findOne(query, projection,
			function(error, organizationModel) {
				if (error) { return callback && callback(error); }
				if (!organizationModel) {
					error = new Error();
					error.status = 404;
					return callback && callback(error);
				}
				return callback && callback(null, organizationModel);
			}
		);
	};

	OrganizationService.prototype.updateOrganization = function(organizationAlias, organizationModel, callback) {
		if (!organizationAlias) { return _failValidation('No organization specified', callback); }
		if (!organizationModel) { return _failValidation('No organization model specified', callback); }

		// TODO: validate organization model updates

		var organizationAliasHasChanged = (('alias' in organizationModel) && (organizationAlias !== organizationModel.alias));

		var criteria = { 'alias': organizationAlias };
		var updates = { $set: organizationModel };
		var options = { safe: true };

		var self = this;
		_updateOrganization(organizationAlias, organizationModel, _handleOrganizationUpdated);


		function _handleOrganizationUpdated(error, organizationModel) {
			if (error) { return callback && callback(error); }

			if (organizationAliasHasChanged) {
				var oldOrganizationAlias = organizationAlias;
				var newOrganizationAlias = organizationModel.alias;
				_updateOrganizationAliasAcrossCollections(oldOrganizationAlias, newOrganizationAlias, _handleOrganizationAliasUpdated);
			} else {
				return callback && callback(null, organizationModel);
			}


			function _handleOrganizationAliasUpdated(error, organizationAlias) {
				if (error) { return callback && callback(error); }
				return callback && callback(null, organizationModel);
			}
		}


		function _updateOrganization(organizationAlias, organizationModel, callback) {
			self.dataService.db.collection(DB_COLLECTION_ORGANIZATIONS).update(criteria, updates, options,
				function(error, numRecords) {
					if (error) { return callback && callback(error); }
					if (numRecords === 0) {
						error = new Error();
						error.status = 404;
						return callback && callback(error);
					}
					return callback && callback(null, organizationModel);
				}
			);
		}

		function _updateOrganizationAliasAcrossCollections(oldOrganizationAlias, newOrganizationAlias, callback) {
			_updateAdministratorsCollection(oldOrganizationAlias, newOrganizationAlias, _handleAdministratorsCollectionUpdated);


			function _handleAdministratorsCollectionUpdated(error) {
				if (error) { return callback && callback(error); }
				_updateDropboxUsersCollection(oldOrganizationAlias, newOrganizationAlias, _handleDropboxUsersCollectionUpdated);


				function _handleDropboxUsersCollectionUpdated(error) {
					if (error) { return callback && callback(error); }
					_updateSitesCollection(oldOrganizationAlias, newOrganizationAlias, _handleSitesCollectionUpdated);


					function _handleSitesCollectionUpdated(error) {
						if (error) { return callback && callback(error); }
						return callback && callback(null, newOrganizationAlias);
					}
				}
			}


			function _updateAdministratorsCollection(oldOrganizationAlias, newOrganizationAlias, callback) {
				var criteria = { 'organization': oldOrganizationAlias };
				var updates = { $set: { 'organization': newOrganizationAlias } };
				var options = { safe: true };

				self.dataService.db.collection(DB_COLLECTION_ADMINISTRATORS).update(criteria, updates, options,
					function(error, numRecords) {
						if (error) { return callback && callback(error); }
						return callback && callback(null, newOrganizationAlias);
					}
				);
			}

			function _updateDropboxUsersCollection(oldOrganizationAlias, newOrganizationAlias, callback) {
				var criteria = { 'organization': oldOrganizationAlias };
				var updates = { $set: { 'organization': newOrganizationAlias } };
				var options = { safe: true };

				self.dataService.db.collection(DB_COLLECTION_DROPBOX_USERS).update(criteria, updates, options,
					function(error, numRecords) {
						if (error) { return callback && callback(error); }
						return callback && callback(null, newOrganizationAlias);
					}
				);
			}

			function _updateSitesCollection(oldOrganizationAlias, newOrganizationAlias, callback) {
				var criteria = { 'organization': oldOrganizationAlias };
				var updates = { $set: { 'organization': newOrganizationAlias } };
				var options = { safe: true };

				self.dataService.db.collection(DB_COLLECTION_SITES).update(criteria, updates, options,
					function(error, numRecords) {
						if (error) { return callback && callback(error); }
						return callback && callback(null, newOrganizationAlias);
					}
				);
			}
		}

		function _failValidation(message, callback) {
			var error = new Error(message);
			error.status = 400;
			return callback && callback(error);
		}
	};

	OrganizationService.prototype.retrieveOrganizationSites = function(organizationAlias, callback) {
		var query = { 'organization': organizationAlias };
		var projection = { '_id': 0, 'public': 0, 'users': 0, 'cache': 0 };
		
		this.dataService.db.collection(DB_COLLECTION_SITES).find(query, projection,
			function(error, siteModelsCursor) {
				if (error) { return callback && callback(error); }
				siteModelsCursor.toArray(_handleSiteModelsLoaded);

				function _handleSiteModelsLoaded(error, siteModels) {
					if (error) { return callback && callback(error); }
					return callback && callback(null, siteModels);
				}
			}
		);
	};

	OrganizationService.prototype.retrieveOrganizationDefaultSiteAlias = function(organizationAlias, callback) {
		var query = { 'alias': organizationAlias };
		var projection = { 'default': 1 };

		this.dataService.db.collection(DB_COLLECTION_ORGANIZATIONS).findOne(query, projection,
			function(error, organizationModel) {
				if (error) { return callback && callback(error); }
				if (!organizationModel) {
					error = new Error();
					error.status = 404;
					return callback && callback(error);
				}
				return callback && callback(null, organizationModel['default']);
			}
		);
	};

	OrganizationService.prototype.updateOrganizationDefaultSiteAlias = function(organizationAlias, siteAlias, callback) {
		if (!organizationAlias) { return _failValidation('No organization specified', callback); }
		if (!organizationAlias) { return _failValidation('No site specified', callback); }

		var criteria = { 'alias': organizationAlias };
		var updates = { $set: { 'default': siteAlias } };
		var options = { 'safe': true };

		this.dataService.db.collection(DB_COLLECTION_ORGANIZATIONS).update(criteria, updates, options,
			function(error, numRecords) {
				if (error) { return callback && callback(error); }
				if (numRecords === 0) {
					error = new Error();
					error.status = 404;
					return callback && callback(error);
				}
				return callback && callback(null, siteAlias);
			}
		);


		function _failValidation(message, callback) {
			var error = new Error(message);
			error.status = 400;
			return callback && callback(error);
		}
	};

	OrganizationService.prototype.retrieveDropboxAccountOrganization = function(dropboxEmail, callback) {
		var query = { 'email': dropboxEmail };
		var projection = { 'organization': 1 };

		this.dataService.db.collection(DB_COLLECTION_DROPBOX_USERS).findOne(query, projection,
			function(error, dropboxUserModel) {
				if (error) { return callback && callback(error); }
				if (!dropboxUserModel) {
					error = new Error();
					error.status = 404;
					return callback && callback(error);
				}
				return callback && callback(null, dropboxUserModel.organization);
			}
		);
	};

	OrganizationService.prototype.retrieveOrganizationShares = function(organizationAlias, callback) {
		var query = { 'alias': organizationAlias };
		var projection = { 'shares': 1 };

		this.dataService.db.collection(DB_COLLECTION_ORGANIZATIONS).findOne(query, projection,
			function(error, organizationModel) {
				if (error) { return callback && callback(error); }
				if (!organizationModel) {
					error = new Error();
					error.status = 404;
					return callback && callback(error);
				}
				return callback && callback(null, organizationModel['shares']);
			}
		);
	};


	OrganizationService.prototype.createOrganizationShare = function(organizationAlias, shareModel, callback) {
		if (!organizationAlias) { return _failValidation('No organization specified', callback); }
		if (!shareModel) { return _failValidation('No share model specified', callback); }
		if (!shareModel.alias) { return _failValidation('No share alias specified', callback); }
		if (!shareModel.name) { return _failValidation('No share name specified', callback); }
		
		// TODO: Validate alias when creating share
		// TODO: Validate name when creating share

		var shareModelFields = {
			'alias': shareModel.alias,
			'name': shareModel.name
		};

		var query = { 'username': organizationAlias };
		var updates = { $push: { 'shares' : shareModelFields } };
		var options = { safe: true };

		this.dataService.db.collection(DB_COLLECTION_ORGANIZATIONS).update(query, updates, options,
			function(error, numRecords) {
				if (error) { return callback && callback(error); }
				if (numRecords === 0) {
					error = new Error();
					error.status = 404;
					return callback && callback(error);
				}
				return callback && callback(null, shareModelFields);
			}
		);


		function _failValidation(message, callback) {
			var error = new Error(message);
			error.status = 400;
			return callback && callback(error);
		}
	};


	OrganizationService.prototype.deleteOrganizationShare = function(organizationAlias, shareAlias, callback) {
		if (!organizationAlias) { return _failValidation('No organization specified', callback); }
		if (!shareAlias) { return _failValidation('No share specified', callback); }

		var self = this;
		_scanForSitesThatAreUsingShare(organizationAlias, shareAlias, _handleCheckedWhetherSitesAreUsingShare);


		function _handleCheckedWhetherSitesAreUsingShare(error, sitesUsingShare) {
			if (error) { return callback && callback(error); }

			if (sitesUsingShare && (sitesUsingShare.length > 0)) {
				// TODO: Return proper confirmation page for when dropbox folder is currently in use
				error = new Error('Dropbox folder is currently being used by the following sites: "' + sitesUsingShare.join('", "') + '"');
				error.status = 403;
				return callback && callback(error);
			}

			_deleteOrganizationShare(organizationAlias, shareAlias, _handleShareDeleted);


			function _handleShareDeleted() {
				if (error) { return callback && callback(error); }
				return callback && callback(null);
			}
		}


		function _scanForSitesThatAreUsingShare(organizationAlias, shareAlias, callback) {
			var query = { 'organization': organizationAlias, 'share': shareAlias };
			var projection = { 'alias': 1 };

			self.dataService.db.collection(DB_COLLECTION_SITES).find(query, projection,
				function(error, organizationModelsCursor) {
					if (error) { return callback && callback(error); }
					organizationModelsCursor.toArray(_handleOrganizationModelsLoaded);


					function _handleOrganizationModelsLoaded(error, organizationModels) {
						if (error) { return callback && callback(error); }
						var organizationAliases = organizationModels.map(function(organizationModel) {
							return organizationModel.alias;
						});
						return callback && callback(null, organizationAliases);
					}
				}
			);
		}

		function _deleteOrganizationShare(organizationAlias, shareAlias, callback) {
			var criteria = { 'alias': organizationAlias };
			var updates = { $pull: { 'shares': { 'alias': shareAlias } } };
			var options = { safe: true };

			self.dataService.db.collection(DB_COLLECTION_ORGANIZATIONS).update(criteria, updates, options,
				function(error, numRecords) {
					if (error) { return callback && callback(error); }
					if (numRecords === 0) {
						error = new Error();
						error.status = 404;
						return callback && callback(error);
					}
					return callback && callback(null);
				}
			);
		}

		function _failValidation(message, callback) {
			var error = new Error(message);
			error.status = 400;
			return callback && callback(error);
		}
	};


	OrganizationService.prototype.createOrganizationAdministrator = function(administratorModel, callback) {
		var self = this;
		var requireFullModel = true;
		_parseAdministratorModel(administratorModel, requireFullModel, _handleAdministratorModelParsed);


		function _handleAdministratorModelParsed(error, administratorModelFields) {
			if (error) { return callback && callback(error); }

			var options = { safe: true };

			self.dataService.db.collection(DB_COLLECTION_ADMINISTRATORS).insert(administratorModelFields, options,
				function(error, records) {
					if (error && (error.code === MONGO_ERROR_CODE_DUPLICATE_KEY)) {
						error = new Error('A user already exists with that username');
						error.status = 409;
						return callback && callback(error);
					}
					if (error) { return callback && callback(error); }
					return callback && callback(null, administratorModelFields);
				}
			);
		}
	};


	OrganizationService.prototype.updateOrganizationAdministrator = function(organizationAlias, username, administratorModel, callback) {
		var self = this;
		var requireFullModel = false;
		_parseAdministratorModel(administratorModel, requireFullModel, _handleAdministratorModelParsed);


		function _handleAdministratorModelParsed(error, administratorModelFields) {
			if (error) { return callback && callback(error); }

			var criteria = { 'organization': organizationAlias, 'username': username };
			var updates = { $set: administratorModelFields };
			var options = { safe: true };

			self.dataService.db.collection(DB_COLLECTION_ADMINISTRATORS).update(criteria, updates, options,
				function(error, numRecords) {
					if (error && (error.code === MONGO_ERROR_CODE_DUPLICATE_KEY)) {
						error = new Error('A user already exists with that username');
						error.status = 409;
						return callback && callback(error);
					}
					if (error) { return callback && callback(error); }
					if (numRecords === 0) {
						error = new Error();
						error.status = 404;
						return callback && callback(error);
					}
					return callback && callback(null, administratorModelFields);
				}
			);
		}
	};


	OrganizationService.prototype.updateOrganizationAdministratorPassword = function(organizationAlias, username, currentPassword, administratorModel, callback) {
		var self = this;
		var requireFullModel = false;
		_parseAdministratorModel(administratorModel, requireFullModel, _handleAdministratorModelParsed);


		function _handleAdministratorModelParsed(error, administratorModelFields) {
			if (error) { return callback && callback(error); }

			_loadCurrentOrganizationAdministratorAuthenticationDetails(organizationAlias, username, _handleCurrentAuthenticationDetailsLoaded);


			function _handleCurrentAuthenticationDetailsLoaded(error, authenticationDetails) {
				if (error) { return callback && callback(error); }

				var isCurrentPasswordCorrect = _checkPassword(username, currentPassword, authenticationDetails);
				if (!isCurrentPasswordCorrect) {
					error = new Error('Current password was entered incorrectly');
					error.status = 403;
					return callback && callback(error);
				}

				_updateOrganizationAdministratorPassword(organizationAlias, username, administratorModelFields, _handleOrganizationAdministratorPasswordUpdated);


				function _handleOrganizationAdministratorPasswordUpdated(error) {
					if (error) { return callback && callback(error); }
					return callback && callback(null);
				}
			}
		}

		function _checkPassword(username, password, authenticationDetails) {
			var authenticationService = new AuthenticationService();
			var validUsers = [authenticationDetails];
			return authenticationService.authenticate(username, password, validUsers);
		}

		function _loadCurrentOrganizationAdministratorAuthenticationDetails(organizationAlias, username, callback) {
			var query = { 'organization': organizationAlias, 'username': username };
			var projection = { 'username': 1, 'password': 1, 'salt': 1 };

			self.dataService.db.collection(DB_COLLECTION_ADMINISTRATORS).findOne(query, projection,
				function (error, authenticationDetails) {
					if (error) { return callback && callback(error); }
					if (!authenticationDetails) {
						error = new Error();
						error.status = 404;
						return callback && callback(error);
					}
					return callback && callback(null, authenticationDetails);
				}
			);
		}

		function _updateOrganizationAdministratorPassword(organizationAlias, username, administratorModelFields, callback) {
			var criteria = { 'organization': organizationAlias, 'username': username };
			var updates = { $set: administratorModelFields };
			var options = { safe: true };

			self.dataService.db.collection(DB_COLLECTION_ADMINISTRATORS).update(criteria, updates, options,
				function(error, numRecords) {
					if (error && (error.code === MONGO_ERROR_CODE_DUPLICATE_KEY)) {
						error = new Error('A user already exists with that username');
						error.status = 409;
						return callback && callback(error);
					}
					if (error) { return callback && callback(error); }
					if (numRecords === 0) {
						error = new Error();
						error.status = 404;
						return callback && callback(error);
					}
					return callback && callback(null, administratorModelFields);
				}
			);
		}
	};

	OrganizationService.prototype.deleteOrganizationAdministrator = function(organizationAlias, username, callback) {
		if (!organizationAlias) { return _failValidation('No organization specified', callback); }
		if (!username) { return _failValidation('No username specified', callback); }

		var selector = { 'organization': organizationAlias, 'username': username };
		var options = { safe: true };

		this.dataService.db.collection(DB_COLLECTION_ADMINISTRATORS).remove(selector, options,
			function(error, numRecords) {
				if (error) { return callback && callback(error); }
				if (numRecords === 0) {
					error = new Error();
					error.status = 404;
					return callback && callback(error);
				}
				return callback && callback(null);
			}
		);

		function _failValidation(message, callback) {
			var error = new Error(message);
			error.status = 400;
			return callback && callback(error);
		}
	};

	function _parseAdministratorModel(administratorModel, requireFullModel, callback) {
		_validateAdministratorModel(administratorModel, requireFullModel, _handleAdministratorModelValidated);


		function _handleAdministratorModelValidated(error, administratorModel) {
			if (error) { return callback && callback(error); }
			var parsedModelFields = _parseModelFields(administratorModel);
			return callback && callback(null, parsedModelFields);
		}

		function _parseModelFields(administratorModel) {
			var administratorModelFields = {};
			if ('organization' in administratorModel) { administratorModelFields.organization = administratorModel.organization; }
			if ('email' in administratorModel) { administratorModelFields.email = administratorModel.email; }
			if ('name' in administratorModel) { administratorModelFields.name = administratorModel.name; }
			if ('username' in administratorModel) { administratorModelFields.username = administratorModel.username; }
			if ('password' in administratorModel) {
				if (!administratorModel.username) { throw new Error('No username specified'); }
				var authenticationService = new AuthenticationService();
				var authenticationDetails = authenticationService.create(administratorModel.username, administratorModel.password);
				administratorModelFields.password = authenticationDetails.password;
				administratorModelFields.salt = authenticationDetails.salt;
			}
			return administratorModelFields;
		}
	}

	function _validateAdministratorModel(administratorModel, requireFullModel, callback) {
		if (!administratorModel) { return _failValidation('No user model specified', callback); }
		if ((requireFullModel || ('organization' in administratorModel)) && !administratorModel.organization) { return _failValidation('No organization specified', callback); }
		if ((requireFullModel || ('username' in administratorModel)) && !administratorModel.username) { return _failValidation('No username specified', callback); }
		if ((requireFullModel || ('email' in administratorModel)) && !administratorModel.email) { return _failValidation('No email specified', callback); }
		if ((requireFullModel || ('password' in administratorModel)) && !administratorModel.password) { return _failValidation('No password specified', callback); }
		if ((requireFullModel || ('name' in administratorModel)) && !administratorModel.name) { return _failValidation('No name specified', callback); }

		// TODO: Validate organization when validating administrator model
		// TODO: Validate username when validating administrator model
		// TODO: Validate email when validating administrator model
		// TODO: Validate password when validating administrator model
		// TODO: Validate name when validating administrator model
		
		return callback && callback(null, administratorModel);


		function _failValidation(message, callback) {
			var error = new Error(message);
			error.status = 400;
			return callback && callback(error);
		}
	}

	return OrganizationService;
})();
