module.exports = (function() {
	'use strict';

	var DB_COLLECTION_ORGANIZATIONS = 'organizations';
	var DB_COLLECTION_ADMINISTRATORS = 'administrators';
	var DB_COLLECTION_DROPBOX_USERS = 'dropboxUsers';
	var DB_COLLECTION_SITES = 'sites';

	var ORGANIZATION_SHARE_ROOT_FORMAT = '/.dropkick/sites/${ORGANIZATION}/';


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
			function(error, organizationAdministrators) {
				if (error) { return callback && callback(error); }
				return callback && callback(null, organizationAdministrators);
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
		if (!shareModel) { return _failValidation('No share model specified', callback); }
		if (!shareModel.alias) { return _failValidation('No share alias specified', callback); }
		if (!shareModel.name) { return _failValidation('No share name specified', callback); }
		
		// TODO: Validate alias when creating share
		// TODO: Validate name when creating share

		var shareData = {
			'alias': shareModel.alias,
			'name': shareModel.name
		};

		var query = { 'username': organizationAlias };
		var updates = { $push: { 'shares' : shareData } };
		var options = { safe: true };

		this.dataService.db.collection(DB_COLLECTION_ORGANIZATIONS).update(query, updates, options,
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

	return OrganizationService;
})();
