'use strict';

var objectAssign = require('object-assign');
var express = require('express');

var handlebarsEngine = require('../../engines/handlebars');

var UserService = require('../../services/UserService');
var RegistrationService = require('../../services/RegistrationService');
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
	var registrationService = new RegistrationService();
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
		app.get('/register', redirectIfLoggedIn('/'), retrieveCreateUserRoute);
		app.post('/register', redirectIfLoggedIn('/'), createUserRoute);


		function redirectIfLoggedIn(redirectPath) {
			redirectPath = redirectPath || '/';
			return function(req, res, next) {
				if (req.isAuthenticated()) {
					return res.redirect(req.query.redirect || redirectPath);
				}
				next();
			};
		}

		function redirectIfLoggedOut(redirectPath) {
			redirectPath = redirectPath || '/';
			return function(req, res, next) {
				if (!req.isAuthenticated()) {
					return res.redirect(req.query.redirect || redirectPath);
				}
				next();
			};
		}

		function retrieveLoginRoute(req, res, next) {
			new Promise(function(resolve, reject) {
				var adaptersHash = Object.keys(adapters).reduce(function(adaptersHash, key) {
					adaptersHash[key] = true;
					return adaptersHash;
				}, {});
				var templateData = {
					content: {
						redirect: req.query.redirect || null,
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

		function retrieveCreateUserRoute(req, res, next) {
			new Promise(function(resolve, reject) {
				var pendingUserModel = registrationService.getPendingUser(req);
				if (!pendingUserModel) {
					res.redirect('/login');
					return;
				}
				var username = pendingUserModel.username;
				return resolve(
					userService.generateUsername(username)
						.then(function(username) {
							var userDetails = objectAssign({}, pendingUserModel, {
								username: username
							});
							var templateData = {
								content: {
									user: userDetails
								}
							};
							return adminPageService.render(req, res, {
								template: 'register',
								context: templateData
							});
						})
				);
			})
			.catch(function(error) {
				next(error);
			});
		}

		function createUserRoute(req, res, next) {
			new Promise(function(resolve, reject) {
				var pendingUserModel = registrationService.getPendingUser(req);
				var userModel = {
					username: req.body.username,
					firstName: req.body.firstName,
					lastName: req.body.lastName,
					email: req.body.email,
					defaultSite: null,
					adapters: pendingUserModel.adapters
				};
				return resolve(
					userService.createUser(userModel)
						.then(function(userModel) {
							registrationService.clearPendingUser(req);
							req.login(userModel, function(error) {
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
