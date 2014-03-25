module.exports = (function() {
	'use strict';

	var DB_COLLECTION_ORGANIZATIONS = 'organizations';
	var DB_COLLECTION_ADMINISTRATORS = 'administrators';
	var DB_COLLECTION_DROPBOX_USERS = 'dropboxUsers';

	var ORGANIZATION_SHARE_ROOT_FORMAT = '/.dropkick/sites/${ORGANIZATION}/';


	function OrganizationService(dataService) {
		this.dataService = dataService;
	}

	OrganizationService.prototype.dataService = null;

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

	OrganizationService.prototype.getOrganizationShareRoot = function(organizationAlias) {
		return ORGANIZATION_SHARE_ROOT_FORMAT.replace(/\$\{ORGANIZATION\}/, organizationAlias);
	};

	OrganizationService.prototype.retrieveOrganization = function(organizationAlias, callback) {
		var query = { 'alias': organizationAlias };
		var projection = { 'shares': 0 };

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

	OrganizationService.prototype.retrieveDefaultSiteName = function(organizationAlias, callback) {
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

	OrganizationService.prototype.addOrganizationShare = function(organizationAlias, shareName, sharePath, callback) {
		var shareData = {
			'name': shareName,
			'path': sharePath
		};

		var query = { 'username': organizationAlias };
		var updates = {
			'$push': {
				'shares' : shareData
			}
		};

		this.dataService.db.collection(DB_COLLECTION_ORGANIZATIONS).update(query, updates,
			function(error) {
				if (error) { return callback && callback(error); }
				return callback && callback(null);
			}
		);
	};

	return OrganizationService;
})();
