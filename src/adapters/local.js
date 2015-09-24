'use strict';

var express = require('express');
var LocalStrategy = require('passport-local').Strategy;
var slug = require('slug');

var AuthenticationService = require('../services/AuthenticationService');
var RegistrationService = require('../services/RegistrationService');
var UserService = require('../services/UserService');

var HttpError = require('../errors/HttpError');

function LocalAdaptor(database, options) {
	options = options || {};
	var authConfig = options.auth || null;

	if (!database) { throw new Error('Missing database'); }
	if (!authConfig) { throw new Error('Missing local auth config'); }
	if (!authConfig.strategy) { throw new Error('Missing local auth strategy'); }
	if (!authConfig.options) { throw new Error('Missing local auth options'); }

	this.database = database;
	this.authConfig = authConfig;
}

LocalAdaptor.prototype.database = null;
LocalAdaptor.prototype.authConfig = null;

LocalAdaptor.prototype.loginMiddleware = function(passport, passportOptions, callback) {
	var database = this.database;
	var authConfig = this.authConfig;
	var userService = new UserService(database);

	var app = express();

	app.post('/', passport.authenticate('admin/local', passportOptions), callback);

	passport.use('admin/local', new LocalStrategy({ passReqToCallback: true },
		function(req, username, password, callback) {
			var authenticationService = new AuthenticationService();
			var registrationService = new RegistrationService(req);
			userService.retrieveUser(username)
				.catch(function(error) {
					if (error.status === 404) {
						var authUsername = slug(username, { lower: true });
						return authenticationService.create(authUsername, password, authConfig.strategy, authConfig.options)
							.then(function(authUser) {
								var userDetails = {
									username: authUsername
								};
								var adapterConfig = {
									strategy: authConfig.strategy,
									password: authUser.password
								};
								registrationService.setPendingUser(userDetails, 'local', adapterConfig);
								throw new HttpError(401);
							});
					}
					throw error;
				})
				.then(function(userModel) {
					var adapterConfig = userModel.adapters['local'];
					if (!adapterConfig) {
						throw new HttpError(401);
					}
					var validUsers = [
						{
							username: username,
							strategy: adapterConfig.strategy,
							password: adapterConfig.password
						}
					];
					return authenticationService.authenticate(username, password, validUsers)
						.then(function(userModel) {
							if (!userModel) { throw new HttpError(401); }
							return callback(null, userModel);
						});
				})
				.catch(function(error) {
					if (error.status === 401) {
						return callback(null, false);
					}
					return callback(error);
				});
		})
	);

	return app;
};

module.exports = LocalAdaptor;
