'use strict';

var isEqual = require('lodash.isequal');

var UserService = require('../services/UserService');
var RegistrationService = require('../services/RegistrationService');

var HttpError = require('../errors/HttpError');

function LoginAdapter(database) {
	if (!database) { throw new Error('Missing database'); }

	this.database = database;
}

LoginAdapter.prototype.adapterName = null;
LoginAdapter.prototype.database = null;

LoginAdapter.prototype.login = function(req, query, passportValues, callback) {
	var self = this;
	var adapterName = this.adapterName;
	var database = this.database;

	var userService = new UserService(database);
	var registrationService = new RegistrationService();

	registrationService.clearPendingUser(req);
	userService.retrieveAdapterUser(adapterName, query)
		.catch(function(error) {
			if (error.status === 404) {
				return Promise.all([
					self.createUserModel(passportValues),
					self.getAdapterConfig(passportValues)
				])
					.then(function(values) {
						var pendingUserModel = values[0];
						var adapterConfig = values[1];
						pendingUserModel.adapters = {};
						pendingUserModel.adapters[adapterName] = adapterConfig;
						pendingUserModel.adapters.default = adapterName;
						registrationService.setPendingUser(req, pendingUserModel);
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
		.then(function(userModel) {
			callback(null, userModel);
		})
		.catch(function(error) {
			if (error.status === 401) {
				return callback(null, false);
			}
			callback(error);
		});
};

LoginAdapter.prototype.middleware = function(passport, passportOptions, callback) {
	throw new Error('Not implemented');
};

LoginAdapter.prototype.authenticate = function(passportValues, userAdapterConfig) {
	return Promise.reject(new Error('Not implemented'));
};

LoginAdapter.prototype.createUserModel = function(passportValues) {
	return Promise.reject(new Error('Not implemented'));
};

LoginAdapter.prototype.getAdapterConfig = function(passportValues, existingAdapterConfig) {
	return Promise.reject(new Error('Not implemented'));
};

module.exports = LoginAdapter;
