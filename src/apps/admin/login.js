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
		app.get('/create/login', redirectIfLoggedIn('/create'), sessionMiddleware, retrieveSignupLoginRoute);


		function redirectIfLoggedIn(redirectPath) {
			redirectPath = redirectPath || '/';
			return function(req, res, next) {
				if (req.isAuthenticated()) {
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

		function retrieveSignupLoginRoute(req, res, next) {
			new Promise(function(resolve, reject) {
				var adaptersHash = Object.keys(adapters).reduce(function(adaptersHash, key) {
					adaptersHash[key] = true;
					return adaptersHash;
				}, {});
				var templateData = {
					title: 'Link account',
					blank: true,
					borderless: true,
					navigation: false,
					footer: false,
					content: {
						redirect: req.query.redirect || '/create',
						adapters: adaptersHash
					}
				};
				return resolve(
					adminPageService.render(req, res, {
						template: 'create/login',
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
				var RegistrationService = new RegistrationService(req);
				var pendingUser = registrationService.getPendingUser() || {
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
				var RegistrationService = new RegistrationService(req);
				var pendingUser = registrationService.getPendingUser();
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
							registrationService.clearPendingUser();
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
	}
};
