'use strict';

var escapeRegExp = require('escape-regexp');
var dotObject = require('dot-object');

var HttpError = require('../errors/HttpError');

var constants = require('../constants');

var DB_COLLECTION_USERS = constants.DB_COLLECTION_USERS;
var DB_COLLECTION_SITES = constants.DB_COLLECTION_SITES;

function UserService(database) {
	if (!database) { throw new Error('Missing database'); }

	this.database = database;
}

UserService.prototype.database = null;

UserService.prototype.createUser = function(userModel) {
	var database = this.database;
	var requireFullModel = !userModel.pending;
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
};

UserService.prototype.generateUsername = function(username) {
	if (!username) { return Promise.resolve(null); }
	var database = this.database;
	return checkWhetherUsernameExists(database, username)
		.then(function(usernameExists) {
			if (!usernameExists) { return username; }
			return generateUniqueUsername(database, username);
		});


	function generateUniqueUsername(database, username) {
		return getExistingUsernames(database, username)
			.then(function(existingUsernames) {
				var index = 1;
				while (existingUsernames.indexOf(username + index) !== -1) { index++; }
				return username + index;
			});
	}
};

UserService.prototype.retrieveUser = function(username) {
	if (!username) { return Promise.reject(new Error('No username specified')); }
	var database = this.database;
	return retrieveUser(database, { 'username': username });
};

UserService.prototype.retrieveAdapterUser = function(adapterName, query) {
	if (!query) { return Promise.reject(new Error('No query specified')); }
	var database = this.database;
	var nestedQuery = {
		adapters: {}
	};
	nestedQuery.adapters[adapterName] = query;
	var dotNotationQuery = flattenNestedQuery(nestedQuery);
	return retrieveUser(database, dotNotationQuery);


	function flattenNestedQuery(nestedQuery) {
		return dotObject.dot(nestedQuery);
	}
};

UserService.prototype.retrieveUserAdapters = function(username) {
	if (!username) { return Promise.reject(new Error('No username specified')); }
	var database = this.database;
	return retrieveUserAdapters(database, username);
};

UserService.prototype.updateUser = function(username, updates) {
	if (!username) { return Promise.reject(new Error('No username specified')); }
	if (!updates) { return Promise.reject(new Error('No updates specified')); }
	var database = this.database;
	var requireFullModel = false;
	return validateUserModel(updates, requireFullModel)
		.then(function(updates) {
			return updateUser(database, username, updates)
				.catch(function(error) {
					if (error.code === database.ERROR_CODE_DUPLICATE_KEY) {
						throw new HttpError(409, 'This username is being used by another user');
					}
					return;
				})
				.then(function() {
					var usernameWasUpdated = ('username' in updates) && (updates.username !== username);
					if (usernameWasUpdated) {
						return updateSitesUsername(database, username, updates.username);
					}
				});
		});
};

UserService.prototype.updateUserAdapterSettings = function(adapter, uid, adapterSettings) {
	if (!adapter) { return Promise.reject(new Error('No adapter specified')); }
	if (!uid) { return Promise.reject(new Error('No user ID specified')); }
	if (!adapterSettings) { return Promise.reject(new Error('No adapter settings specified')); }
	var database = this.database;
	return updateUserAdapterSettings(database, adapter, uid, adapterSettings);
};

UserService.prototype.deleteUser = function(username) {
	if (!username) { return Promise.reject(new Error('No username specified')); }
	var database = this.database;
	return deleteUserSites(database, username)
		.then(function(numRecords) {
			return deleteUser(database, username);
		});
};

UserService.prototype.retrieveUserDefaultSiteName = function(username) {
	if (!username) { return Promise.reject(new Error('No username specified')); }
	var database = this.database;
	return retrieveUserDefaultSiteName(database, username);
};

UserService.prototype.updateUserDefaultSiteName = function(username, siteName) {
	if (!username) { return Promise.reject(new Error('No username specified')); }
	var database = this.database;
	siteName = siteName || null;
	return updateUserDefaultSiteName(database, username, siteName);
};

UserService.prototype.retrieveUserSites = function(username) {
	if (!username) { return Promise.reject(new Error('No username specified')); }
	var database = this.database;
	return retrieveUserSites(database, username);
};


function checkWhetherUsernameExists(database, username) {
	var query = { 'username': username };
	return database.collection(DB_COLLECTION_USERS).count(query)
		.then(function(numRecords) {
			var usernameExists = numRecords > 0;
			return usernameExists;
		});
}

function getExistingUsernames(database, username) {
	var pattern = new RegExp('^' + escapeRegExp(username) + '[0-9]+$');
	var query = { username: pattern };
	var fields = [
		'username'
	];
	return database.collection(DB_COLLECTION_USERS).find(query, fields)
		.then(function(userModels) {
			var usernames = userModels.map(function(userModel) {
				return userModel.username;
			});
			return usernames;
		});
}

function createUser(database, fields) {
	var userModel = {
		username: fields.username,
		firstName: fields.firstName,
		lastName: fields.lastName,
		email: fields.email,
		defaultSite: fields.defaultSite,
		adapters: fields.adapters,
		pending: Boolean(fields.pending)
	};
	return database.collection(DB_COLLECTION_USERS).insertOne(userModel)
		.then(function() {
			return userModel;
		});
}

function retrieveUser(database, query) {
	var fields = [
		'username',
		'firstName',
		'lastName',
		'email',
		'pending',
		'defaultSite',
		'adapters'
	];
	return database.collection(DB_COLLECTION_USERS).findOne(query, fields)
		.then(function(userModel) {
			if (!userModel) { throw new HttpError(404); }
			return userModel;
		});
}

function retrieveUserAdapters(database, username) {
	var query = { 'username': username };
	var fields = [
		'adapters'
	];
	return database.collection(DB_COLLECTION_USERS).findOne(query, fields)
		.then(function(userModel) {
			if (!userModel) { throw new HttpError(404); }
			return userModel.adapters;
		});
}

function updateUser(database, username, fields) {
	var filter = { 'username': username };
	var updates = { $set: fields };
	return database.collection(DB_COLLECTION_USERS).updateOne(filter, updates)
		.then(function(numRecords) {
			if (numRecords === 0) { throw new HttpError(404); }
			return;
		});
}

function updateUserAdapterSettings(database, adapter, uid, adapterSettings) {
	var adapterSettingsNamespace = 'adapters.' + adapter + '.';
	var filter = getNamespacedObject({ uid: uid }, adapterSettingsNamespace);
	var fields = getNamespacedObject(adapterSettings, adapterSettingsNamespace);
	var updates = { $set: fields };
	return database.collection(DB_COLLECTION_USERS).updateOne(filter, updates)
		.then(function(numRecords) {
			if (numRecords === 0) { throw new HttpError(404); }
			return;
		});


	function getNamespacedObject(object, namespace) {
		return Object.keys(object).reduce(function(output, key) {
			output[namespace + key] = object[key];
			return output;
		}, {});
	}
}

function updateSitesUsername(database, oldUsername, newUsername) {
	var filter = { 'owner': oldUsername };
	var updates = { $set: { 'owner': newUsername } };
	return database.collection(DB_COLLECTION_SITES).updateMany(filter, updates);
}

function deleteUserSites(database, username) {
	var filter = { 'owner': username };
	return database.collection(DB_COLLECTION_SITES).deleteMany(filter);
}

function deleteUser(database, username) {
	var filter = { 'username': username };
	return database.collection(DB_COLLECTION_USERS).deleteOne(filter)
		.then(function(numRecords) {
			if (numRecords === 0) { throw new HttpError(404); }
			return;
		});
}

function retrieveUserDefaultSiteName(database, username) {
	var query = { 'username': username };
	var fields = [
		'defaultSite'
	];
	return database.collection(DB_COLLECTION_USERS).findOne(query, fields)
		.then(function(userModel) {
			if (!userModel) { throw new HttpError(404); }
			var defaultSiteName = userModel.defaultSite;
			return defaultSiteName;
		});
}

function updateUserDefaultSiteName(database, username, siteName) {
	var filter = { 'username': username };
	var updates = { $set: { 'defaultSite': siteName } };
	return database.collection(DB_COLLECTION_USERS).updateOne(filter, updates)
		.then(function(numRecords) {
			if (numRecords === 0) { throw new HttpError(404); }
			return;
		});
}

function retrieveUserSites(database, username) {
	var query = { 'owner': username };
	var fields = [
		'owner',
		'name',
		'label',
		'theme',
		'root',
		'private',
		'published'
	];
	return database.collection(DB_COLLECTION_SITES).find(query, fields);
}

function validateUserModel(userModel, requireFullModel) {
	return new Promise(function(resolve, reject) {
		if (!userModel) { throw new HttpError(400, 'No user model specified'); }
		if ((requireFullModel || ('username' in userModel)) && !userModel.username) { throw new HttpError(400, 'No username specified'); }
		if ((requireFullModel || ('firstName' in userModel)) && !userModel.firstName) { throw new HttpError(400, 'No first name specified'); }
		if ((requireFullModel || ('email' in userModel)) && !userModel.email) { throw new HttpError(400, 'No email specified'); }
		if (requireFullModel && !('lastName' in userModel)) { throw new HttpError(400, 'No last name specified'); }
		if (requireFullModel && !('defaultSite' in userModel)) { throw new HttpError(400, 'No default site specified'); }
		if (requireFullModel && !('pending' in userModel)) { throw new HttpError(400, 'No pending status specified'); }

		// TODO: Validate username when validating user model
		// TODO: Validate firstName when validating user model
		// TODO: Validate lastName when validating user model
		// TODO: Validate email when validating user model
		// TODO: Validate defaultSite when validating user model
		// TODO: Validate adapter when validating user model
		// TODO: Validate pending status when validating user model

		return resolve(userModel);
	});
}

module.exports = UserService;
