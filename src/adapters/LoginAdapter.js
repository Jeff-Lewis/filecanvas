'use strict';

var isEqual = require('lodash.isequal');

var UserService = require('../services/UserService');
var RegistrationService = require('../services/RegistrationService');

var HttpError = require('../errors/HttpError');

function LoginAdapter(database, options) {
	options = options || {};
	var isPersistent = Boolean(options.persistent);

	if (!database) { throw new Error('Missing database'); }

	this.database = database;
	this.persistent = isPersistent;
}

LoginAdapter.prototype.adapterName = null;
LoginAdapter.prototype.database = null;
LoginAdapter.prototype.persistent = false;

LoginAdapter.prototype.login = function(req, query, passportValues, callback) {
	var isPersistent = this.persistent;
	var self = this;
	return (isPersistent ? loginExistingUser(req, query, passportValues) : createSessionUser(req, query, passportValues))
		.then(function(userModel) {
			if (userModel) {
				if (!isPersistent) {
					userModel.pending = true;
				}
				callback(null, userModel);
			} else {
				callback(null, false);
			}
		})
		.catch(function(error) {
			callback(error);
		});

	function loginExistingUser() {
		return self.processLogin(req, query, passportValues);
	}

	function createSessionUser(req, query, passportValues) {
		var database = self.database;
		var userService = new UserService(database);
		return self.createUser(passportValues)
			.then(function(userModel) {
				var username = userModel.username;
				return userService.generateUsername(username)
					.then(function(username) {
						userModel.username = username;
						return userModel;
					});
			});
	}
};

LoginAdapter.prototype.processLogin = function(req, query, passportValues) {
	var self = this;
	var adapterName = this.adapterName;
	var database = this.database;

	var userService = new UserService(database);
	var registrationService = new RegistrationService();

	registrationService.clearPendingUser(req);
	return userService.retrieveAdapterUser(adapterName, query)
		.catch(function(error) {
			if (error.status === 404) {
				return self.createUser(passportValues)
					.then(function(userModel) {
						registrationService.setPendingUser(req, userModel);
						throw new HttpError(401);
					});
			}
			throw error;
		})
		.then(function(userModel) {
			var userAdapterConfig = userModel.adapters[adapterName];
			return self.authenticate(passportValues, userAdapterConfig)
				.then(function(isValidUser) {
					if (!isValidUser) { throw new HttpError(401); }
					return userModel;
				});
		})
		.then(function(userModel) {
			var existingAdapterConfig = userModel.adapters[adapterName];
			return self.getAdapterConfig(passportValues, existingAdapterConfig)
				.then(function(updatedAdapterConfig) {
					var hasUpdatedUserDetails = !isEqual(updatedAdapterConfig, existingAdapterConfig);
					if (hasUpdatedUserDetails) {
						var username = userModel.username;
						return userService.updateUserAdapterSettings(username, adapterName, updatedAdapterConfig)
							.then(function() {
								userModel.adapters[adapterName] = updatedAdapterConfig;
								return userModel;
							});
					} else {
						return userModel;
					}
				});
		})
		.catch(function(error) {
			if (error.status === 401) {
				return null;
			}
			throw error;
		});
};

LoginAdapter.prototype.createUser = function(passportValues) {
	var adapterName = this.adapterName;
	return Promise.all([
		this.getUserDetails(passportValues),
		this.getAdapterConfig(passportValues)
	])
		.then(function(values) {
			var usreModel = values[0];
			var adapterConfig = values[1];
			usreModel.adapters = {};
			usreModel.adapters[adapterName] = adapterConfig;
			usreModel.adapters.default = adapterName;
			return usreModel;
		});
};


LoginAdapter.prototype.middleware = function(passport, passportOptions, callback) {
	throw new Error('Not implemented');
};

LoginAdapter.prototype.authenticate = function(passportValues, userAdapterConfig) {
	return Promise.reject(new Error('Not implemented'));
};

LoginAdapter.prototype.getUserDetails = function(passportValues) {
	return Promise.reject(new Error('Not implemented'));
};

LoginAdapter.prototype.getAdapterConfig = function(passportValues, existingAdapterConfig) {
	return Promise.reject(new Error('Not implemented'));
};

module.exports = LoginAdapter;
