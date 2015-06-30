'use strict';

var DB_COLLECTION_USERS = 'users';
var DB_COLLECTION_SITES = 'sites';

var Promise = require('promise');

var HttpError = require('../errors/HttpError');

var MONGO_ERROR_CODE_DUPLICATE_KEY = 11000;

function UserService(dataService) {
	this.dataService = dataService;
}

UserService.prototype.dataService = null;

UserService.prototype.createUser = function(userModel) {
	var dataService = this.dataService;
	var requireFullModel = true;
	return validateUserModel(userModel, requireFullModel)
		.then(function(userModel) {
			return createUser(dataService, userModel);
		});


	function createUser(dataService, userModel) {
		return new Promise(function(resolve, reject) {
			var options = { safe: true };

			dataService.db.collection(DB_COLLECTION_USERS).insert(userModel, options,
				function(error, records) {
					if (error && (error.code === MONGO_ERROR_CODE_DUPLICATE_KEY)) {
						return reject(new HttpError(409, 'A user already exists for this account'));
					}
					if (error) { return reject(error); }
					return resolve(userModel);
				}
			);
		});
	}
};

UserService.prototype.retrieveUser = function(user) {
	var self = this;
	return new Promise(function(resolve, reject) {
		var query = (typeof user === 'string' ? { 'alias': user } : { 'uid': user });

		self.dataService.db.collection(DB_COLLECTION_USERS).findOne(query,
			function(error, userModel) {
				if (error) { return reject(error); }
				if (!userModel) {
					return reject(new HttpError(404));
				}
				return resolve(userModel);
			}
		);
	});
};

UserService.prototype.retrieveUserDefaultSiteAlias = function(user) {
	var dataService = this.dataService;
	return retrieveUserDefaultSiteAlias(dataService, user);


	function retrieveUserDefaultSiteAlias(dataService, user) {
		return new Promise(function(resolve, reject) {
			var query = (typeof user === 'string' ? { 'alias': user } : { 'uid': user });
			var projection = { 'default': 1 };

			dataService.db.collection(DB_COLLECTION_USERS).findOne(query, projection,
				function(error, userModel) {
					if (error) { return reject(error); }
					if (!userModel) {
						return reject(new HttpError(404));
					}
					var defaultSiteAlias = userModel.default;
					return resolve(defaultSiteAlias);
				}
			);
		});
	}
};

UserService.prototype.retrieveUserSites = function(uid) {
	var dataService = this.dataService;
	return retrieveUserSites(dataService, uid);


	function retrieveUserSites(dataService, uid) {
		return new Promise(function(resolve, reject) {
			var query = { 'user': uid };
			var projection = { '_id': 0, 'public': 0, 'users': 0, 'cache': 0 };

			dataService.db.collection(DB_COLLECTION_SITES).find(query, projection,
				function(error, siteModelsCursor) {
					if (error) { return reject(error); }
					siteModelsCursor.toArray(
						function(error, siteModels) {
							if (error) { return reject(error); }
							return resolve(siteModels);
						}
					);
				}
			);
		});
	}
};

UserService.prototype.updateUser = function(user, updates) {
	if (!user) { return Promise.reject(new HttpError(400, 'No user specified')); }
	if (!updates) { return Promise.reject(new HttpError(400, 'No updates specified')); }

	var dataService = this.dataService;
	var requireFullModel = false;
	return validateUserModel(updates, requireFullModel)
		.then(function(updates) {
			return updateUser(dataService, user, updates);
		});


	function updateUser(dataService, user, fields) {
		return new Promise(function(resolve, reject) {
			var criteria = (typeof user === 'string' ? { 'alias': user } : { 'uid': user });
			var updates = { $set: fields };
			var options = { safe: true };

			dataService.db.collection(DB_COLLECTION_USERS).update(criteria, updates, options,
				function(error, numRecords) {
					if (error && (error.code === MONGO_ERROR_CODE_DUPLICATE_KEY)) {
						return reject(new HttpError(409, 'A user already exists for this account'));
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

UserService.prototype.updateUserDefaultSiteAlias = function(user, siteAlias) {
	if (!user) { return Promise.reject(new HttpError(400, 'No user specified')); }

	var dataService = this.dataService;
	siteAlias = siteAlias || null;
	return updateUserDefaultSiteAlias(dataService, user, siteAlias);


	function updateUserDefaultSiteAlias(dataService, user, siteAlias) {
		return new Promise(function(resolve, reject) {
			var criteria = (typeof user === 'string' ? { 'alias': user } : { 'uid': user });
			var updates = { $set: { 'default': siteAlias } };
			var options = { 'safe': true };

			dataService.db.collection(DB_COLLECTION_USERS).update(criteria, updates, options,
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

UserService.prototype.deleteUser = function(user) {
	if (!user) { return Promise.reject(new HttpError(400, 'No user specified')); }

	var dataService = this.dataService;
	return deleteUser(dataService, user);


	function deleteUser(dataService, user) {
		return new Promise(function(resolve, reject) {
			var selector = (typeof user === 'string' ? { 'alias': user } : { 'uid': user });
			var options = { safe: true };

			dataService.db.collection(DB_COLLECTION_USERS).remove(selector, options,
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

function validateUserModel(userModel, requireFullModel) {
	return new Promise(function(resolve, reject) {
		if (!userModel) { throw new HttpError(400, 'No user specified'); }
		if ((requireFullModel || ('uid' in userModel)) && !userModel.uid) { throw new HttpError(400, 'No user ID specified'); }
		if ((requireFullModel || ('token' in userModel)) && !userModel.token) { throw new HttpError(400, 'No access token specified'); }
		if ((requireFullModel || ('alias' in userModel)) && !userModel.alias) { throw new HttpError(400, 'No alias specified'); }
		if ((requireFullModel || ('name' in userModel)) && !userModel.name) { throw new HttpError(400, 'No name specified'); }
		if ((requireFullModel || ('email' in userModel)) && !userModel.email) { throw new HttpError(400, 'No email specified'); }
		if (requireFullModel && !('default' in userModel)) { throw new HttpError(400, 'No default site specified'); }

		// TODO: Validate uid when validating user model
		// TODO: Validate token when validating user model
		// TODO: Validate name when validating user model
		// TODO: Validate email when validating user model
		// TODO: Validate alias when validating user model
		// TODO: Validate default when validating user model

		return resolve(userModel);
	});
}

module.exports = UserService;
