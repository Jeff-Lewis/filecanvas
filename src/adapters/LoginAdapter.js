'use strict';

var objectAssign = require('object-assign');
var isEqual = require('lodash.isequal');

var UserService = require('../services/UserService');
var RegistrationService = require('../services/RegistrationService');

var HttpError = require('../errors/HttpError');

function LoginAdapter(database, options) {
	options = options || {};

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
						var uid = existingAdapterConfig.uid;
						return userService.updateUserAdapterSettings(adapterName, uid, updatedAdapterConfig)
							.then(function() {
								userModel.adapters[adapterName] = objectAssign({}, existingAdapterConfig, updatedAdapterConfig);
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
		})
		.then(function(userModel) {
			if (userModel) {
				callback(null, userModel);
			} else {
				callback(null, false);
			}
		})
		.catch(function(error) {
			callback(error);
		});
};

LoginAdapter.prototype.createUser = function(passportValues) {
	var adapterName = this.adapterName;
	return Promise.all([
		this.getUserDetails(passportValues),
		this.getAdapterConfig(passportValues)
	])
		.then(function(values) {
			var userModel = values[0];
			var adapterConfig = values[1];
			userModel.adapters = {};
			userModel.adapters[adapterName] = adapterConfig;
			userModel.adapters.default = adapterName;
			return userModel;
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
