'use strict';

var objectAssign = require('object-assign');
var isEqual = require('lodash.isequal');

var UserService = require('../services/UserService');

var HttpError = require('../errors/HttpError');

function LoginService(database, loginAdapter) {
	if (!database) { throw new Error('Missing database'); }

	this.database = database;
	this.adapter = loginAdapter;
}

LoginService.prototype.database = null;

LoginService.prototype.login = function(query, passportValues) {
	var loginAdapter = this.adapter;
	var adapterName = loginAdapter.adapterName;
	var database = this.database;

	var userService = new UserService(database);

	return userService.retrieveAdapterUser(adapterName, query)
		.then(function(userModel) {
			return userModel;
		})
		.catch(function(error) {
			if (error.status === 404) {
				return createUserModel(passportValues, loginAdapter)
					.then(function(userModel) {
						var username = userModel.username;
						return userService.generateUsername(username)
							.then(function(validUsername) {
								userModel.username = validUsername;
								return userService.createUser(userModel)
									.then(function(userModel) {
										return userModel;
									});
							});
					});
			}
			throw error;
		})
		.then(function(userModel) {
			var userAdapterConfig = userModel.adapters[adapterName];
			return loginAdapter.authenticate(passportValues, userAdapterConfig)
				.then(function(isValidUser) {
					if (!isValidUser) { throw new HttpError(401); }
					return userModel;
				});
		})
		.then(function(userModel) {
			var existingAdapterConfig = userModel.adapters[adapterName];
			return loginAdapter.getAdapterConfig(passportValues, existingAdapterConfig)
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
		.then(function(userModel) {
			var username = userModel.username;
			var updates = {
				'lastLogin': new Date()
			};
			return userService.updateUser(username, updates)
				.then(function() {
					return userModel;
				});
		})
		.catch(function(error) {
			if (error.status === 401) {
				return null;
			}
			throw error;
		})
		.then(function(userModel) {
			return userModel || false;
		});


		function createUserModel(passportValues, loginAdapter) {
			return Promise.all([
				loginAdapter.getUserDetails(passportValues),
				loginAdapter.getAdapterConfig(passportValues)
			])
				.then(function(values) {
					var userModel = values[0];
					var adapterConfig = values[1];
					userModel.adapters = {};
					userModel.adapters[adapterName] = adapterConfig;
					userModel.adapters.default = adapterName;
					userModel.pending = true;
					return userModel;
				});
		}
};

module.exports = LoginService;
