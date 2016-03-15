'use strict';

var objectAssign = require('object-assign');
var express = require('express');

var handlebarsEngine = require('../../engines/handlebars');

var UserService = require('../../services/UserService');
var AdminPageService = require('../../services/AdminPageService');

module.exports = function(database, options) {
	options = options || {};
	var templatesPath = options.templatesPath || null;
	var partialsPath = options.partialsPath || null;
	var adapters = options.adapters || null;
	var sessionMiddleware = options.sessionMiddleware || null;

	if (!database) { throw new Error('Missing database'); }
	if (!templatesPath) { throw new Error('Missing templates path'); }
	if (!partialsPath) { throw new Error('Missing partials path'); }
	if (!adapters) { throw new Error('Missing adapters'); }
	if (!sessionMiddleware) { throw new Error('Missing admin session middleware'); }

	var userService = new UserService(database);
	var adminPageService = new AdminPageService({
		templatesPath: templatesPath,
		partialsPath: partialsPath,
		sessionMiddleware: sessionMiddleware
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
		app.get('/login', redirectIfLoggedIn('/'), retrieveLoginRoute);
		app.get('/logout', redirectIfLoggedOut('/'), retrieveLogoutRoute);
		app.get('/register', redirectIfNoPendingUser('/'), retrieveRegisterRoute);
		app.post('/register', redirectIfNoPendingUser('/'), updateUserRoute);


		function redirectIfLoggedIn(redirectPath) {
			return createRedirect(redirectPath, function(req) {
				return req.isAuthenticated();
			});
		}

		function redirectIfLoggedOut(redirectPath) {
			return createRedirect(redirectPath, function(req) {
				return !req.isAuthenticated();
			});
		}

		function redirectIfNoPendingUser(redirectPath) {
			return createRedirect(redirectPath, function(req) {
				return (!req.isAuthenticated() || !req.user.pending);
			});
		}

		function createRedirect(redirectPath, condition) {
			redirectPath = redirectPath || '/';
			return function(req, res, next) {
				if (!condition || condition(req)) {
					return res.redirect(req.query.redirect || redirectPath);
				}
				next();
			};
		}


		function retrieveLoginRoute(req, res, next) {
			var forceApproval = (req.query['reapprove'] === 'true');
			var error = (req.query['error'] || req.query['error_description'] ? {} : null);
			if (req.query['error']) { error['error'] = req.query['error']; }
			if (req.query['error_description']) { error['error_description'] = req.query['error_description']; }

			new Promise(function(resolve, reject) {
				var adaptersHash = Object.keys(adapters).reduce(function(adaptersHash, key) {
					adaptersHash[key] = true;
					return adaptersHash;
				}, {});
				var templateData = {
					content: {
						redirect: req.query.redirect || null,
						forceApproval: forceApproval,
						error: error,
						adapters: adaptersHash
					}
				};
				return resolve(
					adminPageService.render(req, res, {
						template: 'login',
						context: templateData
					})
				);
			})
			.catch(function(error) {
				next(error);
			});
		}

		function retrieveRegisterRoute(req, res, next) {
			var userModel = req.user;
			new Promise(function(resolve, reject) {
				var templateData = {
					content: {
						user: userModel
					}
				};
				return resolve(
					adminPageService.render(req, res, {
						template: 'register',
						context: templateData
					})
				);
			})
			.catch(function(error) {
				next(error);
			});
		}

		function updateUserRoute(req, res, next) {
			var userModel = req.user;
			var username = userModel.username;

			new Promise(function(resolve, reject) {
				var updates = {
					username: req.body.username,
					firstName: req.body.firstName,
					lastName: req.body.lastName,
					email: req.body.email,
					pending: (req.body.pending === 'true')
				};
				return resolve(
					userService.updateUser(username, updates)
						.then(function() {
							var updatedUserModel = objectAssign({}, userModel, updates);
							req.login(updatedUserModel, function(error) {
								if (error) { return next(error); }
								res.redirect('/');
							});
						})
				);
			})
			.catch(function(error) {
				next(error);
			});
		}

		function retrieveLogoutRoute(req, res, next) {
			var adapterName = req.session.adapter;
			req.logout();
			req.session.regenerate(function(error) {
				if (error) { return next(error); }
				if (!adapterName || (adapterName === 'local')) {
					return res.redirect('/');
				}
				var templateData = {
					content: {
						adapter: adapterName
					}
				};
				adminPageService.render(req, res, {
					template: 'logout',
					context: templateData
				})
					.catch(function(error) {
						next(error);
					});
			});
		}
	}
};
