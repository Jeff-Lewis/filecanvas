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
		app.get('/login', redirectIfLoggedIn('/'), sessionMiddleware, retrieveLoginRoute);
		app.get('/register', redirectIfLoggedIn('/'), sessionMiddleware, retrieveRegisterRoute);
		app.post('/register', redirectIfLoggedIn('/'), sessionMiddleware, processRegisterRoute);
		app.get('/logout', redirectIfLoggedOut('/'), sessionMiddleware, retrieveLogoutRoute);


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
					title: 'Login',
					navigation: false,
					footer: true,
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

		function retrieveRegisterRoute(req, res, next) {
			new Promise(function(resolve, reject) {
				var pendingUser = registrationService.getPendingUser(req) || {
					user: {
						username: null
					}
				};
				var userDetails = pendingUser.user;
				var username = userDetails.username;
				return resolve(
					userService.generateUsername(username)
						.then(function(username) {
							userDetails = objectAssign(userDetails, {
								username: username
							});
							var templateData = {
								title: 'Your profile',
								navigation: false,
								header: {
									title: 'Create account'
								},
								footer: true,
								content: {
									user: pendingUser.user
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

		function processRegisterRoute(req, res, next) {
			new Promise(function(resolve, reject) {
				var pendingUser = registrationService.getPendingUser(req);
				var adapter = pendingUser.adapter;
				var adapterConfig = pendingUser.adapterConfig;
				var userDetails = {
					username: req.body.username,
					firstName: req.body.firstName,
					lastName: req.body.lastName,
					email: req.body.email
				};
				return resolve(
					userService.createUser(userDetails, adapter, adapterConfig)
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
					title: 'Logout',
					navigation: true,
					footer: true,
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
