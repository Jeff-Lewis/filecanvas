'use strict';

var escapeRegExp = require('escape-regexp');

var HttpError = require('../errors/HttpError');

var constants = require('../constants');

var DB_COLLECTION_USERS = constants.DB_COLLECTION_USERS;
var DB_COLLECTION_SITES = constants.DB_COLLECTION_SITES;

function UserService(database) {
	this.database = database;
}

UserService.prototype.database = null;

UserService.prototype.generateUniqueAlias = function(alias) {
	var database = this.database;
	return checkWhetherAliasExists(database, alias)
		.then(function(aliasExists) {
			if (!aliasExists) { return alias; }
			return generateUniqueAlias(database, alias);
		});


	function checkWhetherAliasExists(database, alias) {
		var query = { 'alias': alias };
		return database.collection(DB_COLLECTION_USERS).count(query)
			.then(function(numRecords) {
				var aliasExists = numRecords > 0;
				return aliasExists;
			});
	}

	function generateUniqueAlias(database, alias) {
		return getRegisteredAliases(database, alias)
			.then(function(registeredAliases) {
				var index = 1;
				while (registeredAliases.indexOf(alias + index) !== -1) { index++; }
				return alias + index;
			});
	}

	function getRegisteredAliases(database, alias) {
		var pattern = new RegExp('^' + escapeRegExp(alias) + '\d+$');
		var query = { alias: pattern };
		var fields = [
			'alias'
		];
		return database.collection(DB_COLLECTION_USERS).find(query, fields)
			.then(function(userModels) {
				var userAliases = userModels.map(function(userModel) {
					return userModel.alias;
				});
				return userAliases;
			});
	}
};

UserService.prototype.createUser = function(userModel) {
	var database = this.database;
	var requireFullModel = true;
	return validateUserModel(userModel, requireFullModel)
		.then(function(userModel) {
			return createUser(database, userModel)
				.catch(function(error) {
					if (error.code === database.ERROR_CODE_DUPLICATE_KEY) {
						throw new HttpError(409, 'This account has already been registered');
					}
					throw error;
				});
		});


	function createUser(database, userModel) {
		return database.collection(DB_COLLECTION_USERS).insertOne(userModel)
			.then(function() {
				return userModel;
			});
	}
};

UserService.prototype.retrieveUser = function(user) {
	var database = this.database;
	return retrieveUser(database, user);


	function retrieveUser(database, user) {
		var query = (typeof user === 'string' ? { 'alias': user } : { 'uid': user });
		var fields = [
			'uid',
			'token',
			'alias',
			'firstName',
			'lastName',
			'email',
			'profileName',
			'profileEmail',
			'default'
		];
		return database.collection(DB_COLLECTION_USERS).findOne(query, fields)
			.then(function(userModel) {
				if (!userModel) { throw new HttpError(404); }
				return userModel;
			});
	}
};

UserService.prototype.retrieveUserDefaultSiteAlias = function(user) {
	var database = this.database;
	return retrieveUserDefaultSiteAlias(database, user);


	function retrieveUserDefaultSiteAlias(database, user) {
		var query = (typeof user === 'string' ? { 'alias': user } : { 'uid': user });
		var fields = [
			'default'
		];
		return database.collection(DB_COLLECTION_USERS).findOne(query, fields)
			.then(function(userModel) {
				if (!userModel) { throw new HttpError(404); }
				var defaultSiteAlias = userModel.default;
				return defaultSiteAlias;
			});
	}
};

UserService.prototype.retrieveUserSites = function(uid) {
	var database = this.database;
	return retrieveUserSites(database, uid);


	function retrieveUserSites(database, uid) {
		var query = { 'user': uid };
		var fields = [
			'user',
			'alias',
			'name',
			'title',
			'template',
			'path'
		];
		return database.collection(DB_COLLECTION_SITES).find(query, fields);
	}
};

UserService.prototype.updateUser = function(user, updates) {
	if (!user) { return Promise.reject(new HttpError(400, 'No user specified')); }
	if (!updates) { return Promise.reject(new HttpError(400, 'No updates specified')); }

	var database = this.database;
	var requireFullModel = false;
	return validateUserModel(updates, requireFullModel)
		.then(function(updates) {
			return updateUser(database, user, updates)
				.catch(function(error) {
					if (error.code === database.ERROR_CODE_DUPLICATE_KEY) {
						throw new HttpError(409, 'This username is being used by another user');
					}
				});
		});


	function updateUser(database, user, fields) {
		var filter = (typeof user === 'string' ? { 'alias': user } : { 'uid': user });
		var updates = { $set: fields };
		return database.collection(DB_COLLECTION_USERS).updateOne(filter, updates)
			.then(function(numRecords) {
				if (numRecords === 0) { throw new HttpError(404); }
			});
	}
};

UserService.prototype.updateUserDefaultSiteAlias = function(user, siteAlias) {
	if (!user) { return Promise.reject(new HttpError(400, 'No user specified')); }

	var database = this.database;
	siteAlias = siteAlias || null;
	return updateUserDefaultSiteAlias(database, user, siteAlias);


	function updateUserDefaultSiteAlias(database, user, siteAlias) {
		var filter = (typeof user === 'string' ? { 'alias': user } : { 'uid': user });
		var updates = { $set: { 'default': siteAlias } };
		return database.collection(DB_COLLECTION_USERS).updateOne(filter, updates)
			.then(function(numRecords) {
				if (numRecords === 0) { throw new HttpError(404); }
			});
	}
};

UserService.prototype.deleteUser = function(uid) {
	if (!uid) { return Promise.reject(new HttpError(400, 'No user specified')); }

	var database = this.database;
	return deleteUserSites(database, uid)
		.then(function(numRecords) {
			return deleteUser(database, uid);
		});


	function deleteUserSites(database, uid) {
		var filter = { 'user': uid };
		return database.collection(DB_COLLECTION_SITES).deleteMany(filter);
	}

	function deleteUser(database, uid) {
		var filter = { 'uid': uid };
		return database.collection(DB_COLLECTION_USERS).deleteOne(filter)
			.then(function(numRecords) {
				if (numRecords === 0) { throw new HttpError(404); }
			});
	}
};

function validateUserModel(userModel, requireFullModel) {
	return new Promise(function(resolve, reject) {
		if (!userModel) { throw new HttpError(400, 'No user specified'); }
		if ((requireFullModel || ('uid' in userModel)) && !userModel.uid) { throw new HttpError(400, 'No user ID specified'); }
		if ((requireFullModel || ('token' in userModel)) && !userModel.token) { throw new HttpError(400, 'No access token specified'); }
		if ((requireFullModel || ('alias' in userModel)) && !userModel.alias) { throw new HttpError(400, 'No username specified'); }
		if ((requireFullModel || ('firstName' in userModel)) && !userModel.firstName) { throw new HttpError(400, 'No first name specified'); }
		if ((requireFullModel || ('lastName' in userModel)) && !userModel.firstName) { throw new HttpError(400, 'No last name specified'); }
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
