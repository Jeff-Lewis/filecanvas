'use strict';

var assert = require('assert');
var express = require('express');

var handlebarsEngine = require('../../engines/handlebars');

var UserService = require('../../services/UserService');
var AdminPageService = require('../../services/AdminPageService');

module.exports = function(database, options) {
	options = options || {};
	var templatesPath = options.templatesPath || null;
	var partialsPath = options.partialsPath || null;
	var sessionMiddleware = options.sessionMiddleware || null;
	var adapters = options.adapters || null;
	var analyticsConfig = options.analytics || null;

	assert(database, 'Missing database');
	assert(templatesPath, 'Missing templates path');
	assert(partialsPath, 'Missing partials path');
	assert(sessionMiddleware, 'Missing session middleware');
	assert(adapters, 'Missing adapters');
	assert(analyticsConfig, 'Missing analytics configuration');

	var userService = new UserService(database);
	var adminPageService = new AdminPageService({
		templatesPath: templatesPath,
		partialsPath: partialsPath,
		sessionMiddleware: sessionMiddleware,
		analytics: analyticsConfig
	});

	var app = express();

	initRoutes(app);
	initViewEngine(app, {
		templatesPath: templatesPath
	});

	return app;


	function initViewEngine(app, options) {
		options = options || {};
		var templatesPath = options.templatesPath;

		app.engine('hbs', handlebarsEngine);
		app.set('views', templatesPath);
		app.set('view engine', 'hbs');
	}

	function initRoutes(app) {
		app.get('/', retrieveUserAccountRoute);
		app.put('/', updateUserAccountRoute);
		app.delete('/', deleteUserAccountRoute);


		function retrieveUserAccountRoute(req, res, next) {
			var userModel = req.user;

			new Promise(function(resolve, reject) {
				var templateData = {
					content: {
						user: userModel
					}
				};
				resolve(
					adminPageService.render(req, res, {
						template: 'account',
						context: templateData
					})
				);
			})
			.catch(function(error) {
				next(error);
			});
		}

		function updateUserAccountRoute(req, res, next) {
			var userModel = req.user;
			var username = userModel.username;
			var updates = {};
			if ('username' in req.body) { updates.username = req.body.username; }
			if ('firstName' in req.body) { updates.firstName = req.body.firstName; }
			if ('lastName' in req.body) { updates.lastName = req.body.lastName; }
			if ('email' in req.body) { updates.email = req.body.email; }
			if ('defaultSite' in req.body) { updates.defaultSite = req.body.defaultSite || null; }

			new Promise(function(resolve, reject) {
				resolve(
					userService.updateUser(username, updates)
						.then(function() {
							var hasUpdatedUsername = ('username' in updates) && (updates.username !== userModel.username);
							if (!hasUpdatedUsername) { return; }
							return updatePassportUsername(req, userModel, updates.username);
						})
						.then(function(userModel) {
							res.redirect(303, '/account');
						})
				);
			})
			.catch(function(error) {
				next(error);
			});


			function updatePassportUsername(req, userModel, username) {
				return new Promise(function(resolve, reject) {
					userModel.username = username;
					req.login(userModel, function(error) {
						if (error) { return reject(error); }
						resolve();
					});
				});
			}
		}

		function deleteUserAccountRoute(req, res, next) {
			var userModel = req.user;
			var username = userModel.username;
			new Promise(function(resolve, reject) {
				resolve(
					unlinkUserAccounts(userModel, adapters)
						.catch(function(error) {
							// Ignore failure
						})
						.then(function() {
							return userService.deleteUser(username);
						})
						.then(function() {
							req.logout();
							req.session.regenerate(function(error) {
								if (error) { return next(error); }
								res.redirect(303, '/');
							});
						})
				);
			})
			.catch(function(error) {
				next(error);
			});


			function unlinkUserAccounts(userModel, adapters) {
				return Promise.all(
					Object.keys(userModel.adapters).filter(function(adapterName) {
						return adapterName !== 'default';
					}).map(function(adapterName) {
						var adapter = adapters[adapterName];
						var userAdapterConfig = userModel.adapters[adapterName];
						return adapter.unlink(userAdapterConfig);
					})
				).then(function() {
					return;
				});
			}
		}

	}
};
