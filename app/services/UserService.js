'use strict';

var Promise = require('promise');
var escapeRegExp = require('escape-regexp');

var HttpError = require('../errors/HttpError');

var config = require('../../config');

var DB_COLLECTION_USERS = config.db.collections.users;
var DB_COLLECTION_DOMAINS = config.db.collections.domains;
var DB_COLLECTION_SITES = config.db.collections.sites;

function UserService(dataService) {
	this.dataService = dataService;
}

UserService.prototype.dataService = null;

UserService.prototype.generateUniqueAlias = function(alias) {
	var dataService = this.dataService;
	return checkWhetherAliasExists(dataService, alias)
		.then(function(aliasExists) {
			if (!aliasExists) { return alias; }
			return generateUniqueAlias(dataService, alias);
		});


	function checkWhetherAliasExists(dataService, alias) {
		var query = { 'alias': alias };
		return dataService.collection(DB_COLLECTION_USERS).count(query)
			.then(function(numRecords) {
				var aliasExists = numRecords > 0;
				return aliasExists;
			});
	}

	function generateUniqueAlias(dataService, alias) {
		return getRegisteredAliases(dataService, alias)
			.then(function(registeredAliases) {
				var index = 1;
				while (registeredAliases.indexOf(alias + index) !== -1) { index++; }
				return alias + index;
			});
	}

	function getRegisteredAliases(dataService, alias) {
		var pattern = new RegExp('^' + escapeRegExp(alias) + '\d+$');
		var query = { alias: pattern };
		var fields = [
			'alias'
		];
		return dataService.collection(DB_COLLECTION_USERS).find(query, fields)
			.then(function(userModels) {
				var userAliases = userModels.map(function(userModel) {
					return userModel.alias;
				});
				return userAliases;
			});
	}
};

UserService.prototype.createUser = function(userModel) {
	var dataService = this.dataService;
	var requireFullModel = true;
	return validateUserModel(userModel, requireFullModel)
		.then(function(userModel) {
			return createUser(dataService, userModel)
				.catch(function(error) {
					if (error.code === dataService.ERROR_CODE_DUPLICATE_KEY) {
						throw new HttpError(409, 'This account has already been registered');
					}
					throw error;
				});
		});


	function createUser(dataService, userModel) {
		return dataService.collection(DB_COLLECTION_USERS).insertOne(userModel)
			.then(function() {
				return userModel;
			});
	}
};

UserService.prototype.createUserDomain = function(uid, domain) {
	var dataService = this.dataService;
	var domainModel = {
		name: domain,
		user: uid,
		site: null
	};
	return createUserDomain(dataService, domainModel)
		.catch(function(error) {
			if (error.code === dataService.ERROR_CODE_DUPLICATE_KEY) {
				throw new HttpError(409, 'This domain is already in use');
			}
			throw error;
		});


	function createUserDomain(dataService, domainModel) {
		return dataService.collection(DB_COLLECTION_DOMAINS).insertOne(domainModel)
			.then(function() {
				return domainModel;
			});
	}
};

UserService.prototype.retrieveUser = function(user) {
	var dataService = this.dataService;
	return retrieveUser(dataService, user);


	function retrieveUser(dataService, user) {
		var query = (typeof user === 'string' ? { 'alias': user } : { 'uid': user });
		var fields = [
			'uid',
			'token',
			'alias',
			'name',
			'email',
			'default'
		];
		return dataService.collection(DB_COLLECTION_USERS).findOne(query, fields)
			.then(function(userModel) {
				if (!userModel) { throw new HttpError(404); }
				return userModel;
			});
	}
};

UserService.prototype.retrieveUserDefaultSiteAlias = function(user) {
	var dataService = this.dataService;
	return retrieveUserDefaultSiteAlias(dataService, user);


	function retrieveUserDefaultSiteAlias(dataService, user) {
		var query = (typeof user === 'string' ? { 'alias': user } : { 'uid': user });
		var fields = [
			'default'
		];
		return dataService.collection(DB_COLLECTION_USERS).findOne(query, fields)
			.then(function(userModel) {
				if (!userModel) { throw new HttpError(404); }
				var defaultSiteAlias = userModel.default;
				return defaultSiteAlias;
			});
	}
};

UserService.prototype.retrieveUserSites = function(uid) {
	var dataService = this.dataService;
	return retrieveUserSites(dataService, uid);


	function retrieveUserSites(dataService, uid) {
		var query = { 'user': uid };
		var fields = [
			'user',
			'alias',
			'name',
			'title',
			'template',
			'path'
		];
		return dataService.collection(DB_COLLECTION_SITES).find(query, fields);
	}
};

UserService.prototype.updateUser = function(user, updates) {
	if (!user) { return Promise.reject(new HttpError(400, 'No user specified')); }
	if (!updates) { return Promise.reject(new HttpError(400, 'No updates specified')); }

	var dataService = this.dataService;
	var requireFullModel = false;
	return validateUserModel(updates, requireFullModel)
		.then(function(updates) {
			return updateUser(dataService, user, updates)
				.catch(function(error) {
					if (error.code === dataService.ERROR_CODE_DUPLICATE_KEY) {
						throw new HttpError(409, 'This username is being used by another user');
					}
				});
		});


	function updateUser(dataService, user, fields) {
		var filter = (typeof user === 'string' ? { 'alias': user } : { 'uid': user });
		var updates = { $set: fields };
		return dataService.collection(DB_COLLECTION_USERS).updateOne(filter, updates)
			.then(function(numRecords) {
				if (numRecords === 0) { throw new HttpError(404); }
			});
	}
};

UserService.prototype.retrieveUserDomains = function(uid) {
	var dataService = this.dataService;
	return retrieveUserDomains(dataService, uid);


	function retrieveUserDomains(dataService, uid) {
		var query = { 'user': uid, 'site': null };
		var fields = [
			'name',
			'user',
			'site'
		];
		return dataService.collection(DB_COLLECTION_DOMAINS).find(query, fields);
	}
};

UserService.prototype.updateUserDefaultSiteAlias = function(user, siteAlias) {
	if (!user) { return Promise.reject(new HttpError(400, 'No user specified')); }

	var dataService = this.dataService;
	siteAlias = siteAlias || null;
	return updateUserDefaultSiteAlias(dataService, user, siteAlias);


	function updateUserDefaultSiteAlias(dataService, user, siteAlias) {
		var filter = (typeof user === 'string' ? { 'alias': user } : { 'uid': user });
		var updates = { $set: { 'default': siteAlias } };
		return dataService.collection(DB_COLLECTION_USERS).updateOne(filter, updates)
			.then(function(numRecords) {
				if (numRecords === 0) { throw new HttpError(404); }
			});
	}
};

UserService.prototype.deleteUser = function(uid) {
	if (!uid) { return Promise.reject(new HttpError(400, 'No user specified')); }

	var dataService = this.dataService;
	return deleteUser(dataService, uid)
		.then(function() {
			return deleteUserDomains(dataService, uid);
		});


	function deleteUser(dataService, uid) {
		var filter = { 'uid': uid };
		return dataService.collection(DB_COLLECTION_USERS).deleteOne(filter)
			.then(function(numRecords) {
				if (numRecords === 0) { throw new HttpError(404); }
			});
	}

	function deleteUserDomains(dataService, uid) {
		var filter = { 'user': uid, 'site': null };
		return dataService.collection(DB_COLLECTION_USERS).deleteMany(filter)
			.then(function(numRecords) {});
	}
};

UserService.prototype.deleteUserDomain = function(uid, domain) {
	var dataService = this.dataService;
	return deleteUserDomain(dataService, uid, domain);


	function deleteUserDomain(dataService, uid, domain) {
		var filter = { 'user': uid, 'site': null, 'name': domain };
		return dataService.collection(DB_COLLECTION_DOMAINS).deleteOne(filter)
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
