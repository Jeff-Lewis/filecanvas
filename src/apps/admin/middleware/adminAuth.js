'use strict';

var express = require('express');
var Passport = require('passport').Passport;

var UserService = require('../../../services/UserService');

module.exports = function(database, options) {
	options = options || {};
	var loginRoute = options.login || null;
	var failureRoute = options.failure || null;
	var adapters = options.adapters || null;

	if (!loginRoute) { throw new Error('Missing login route'); }
	if (!failureRoute) { throw new Error('Missing failure redirect'); }
	if (!adapters) { throw new Error('Missing adapters'); }

	var userService = new UserService(database);

	var app = express();

	var passport = new Passport();
	initAuthSerializers(passport);

	app.use(passport.initialize());
	app.use(passport.session());

	initAdapterAuthentication(app, passport, database, {
		login: loginRoute,
		failure: failureRoute,
		adapters: adapters
	});

	return app;


	function initAuthSerializers(passport) {
		passport.serializeUser(function(userModel, callback) {
			var username = userModel.username;
			return callback && callback(null, username);
		});

		passport.deserializeUser(function(username, callback) {
			return userService.retrieveUser(username)
				.then(function(userModel) {
					return callback(null, userModel);
				})
				.catch(function(error) {
					return callback(error);
				});
		});
	}

	function initAdapterAuthentication(app, passport, database, options) {
		options = options || {};
		var loginPath = options.login;
		var failureRedirect = options.failure;
		var adapters = options.adapters;

		Object.keys(adapters).forEach(function(key) {
			var adapterName = key;
			var adapter = adapters[key];
			app.post(loginPath + '/' + adapterName, function(req, res, next) {
				delete req.session.loginRedirect;
				if (req.body.redirect) {
					req.session.loginRedirect = req.body.redirect;
				}
				next();
			});
			var loginMiddleware = adapter.middleware(passport, { failureRedirect: failureRedirect }, function(req, res) {
				req.session.adapter = adapterName;
				var redirectUrl = req.session.loginRedirect;
				delete req.session.loginRedirect;
				res.redirect(redirectUrl || '/');
			});
			app.use(loginPath + '/' + adapterName, loginMiddleware);
		});
	}
};
