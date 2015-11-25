'use strict';

var express = require('express');

var handlebarsEngine = require('../../engines/handlebars');

var UserService = require('../../services/UserService');
var AdminPageService = require('../../services/AdminPageService');

module.exports = function(database, options) {
	options = options || {};
	var templatesPath = options.templatesPath || null;
	var partialsPath = options.partialsPath || null;
	var sessionMiddleware = options.sessionMiddleware || null;

	if (!database) { throw new Error('Missing database'); }
	if (!templatesPath) { throw new Error('Missing templates path'); }
	if (!partialsPath) { throw new Error('Missing partials path'); }
	if (!sessionMiddleware) { throw new Error('Missing session middleware'); }

	var userService = new UserService(database);
	var adminPageService = new AdminPageService({
		templatesPath: templatesPath,
		partialsPath: partialsPath
	});

	var app = express();

	initRoutes(app, sessionMiddleware);
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

	function initRoutes(app, sessionMiddleware) {
		app.get('/', sessionMiddleware, retrieveUserAccountRoute);
		app.put('/', sessionMiddleware, updateUserAccountRoute);
		app.delete('/', sessionMiddleware, deleteUserAccountRoute);


		function retrieveUserAccountRoute(req, res, next) {
			var userModel = req.user;

			new Promise(function(resolve, reject) {
				var templateData = {
					content: {
						user: userModel
					}
				};
				return resolve(
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
				return resolve(
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
				return resolve(
					userService.deleteUser(username)
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
		}

	}
};
