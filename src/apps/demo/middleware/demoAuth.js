'use strict';

var express = require('express');
var Passport = require('passport').Passport;

var adapterAuth = require('../../../middleware/adapterAuth');

module.exports = function(database, options) {
	options = options || {};
	var loginPathPrefix = options.login || null;
	var failureRedirect = options.failure || null;
	var adapters = options.adapters || null;

	if (!loginPathPrefix) { throw new Error('Missing login path prefix'); }
	if (!failureRedirect) { throw new Error('Missing failure redirect'); }
	if (!adapters) { throw new Error('Missing adapters'); }

	var app = express();

	var passport = new Passport();
	app.use(passport.initialize());
	app.use(passport.session());

	app.use(loginPathPrefix, adapterAuth(passport, {
		failureRedirect: failureRedirect,
		adapters: adapters
	}));

	passport.serializeUser(function(userModel, callback) {
		try {
			var serializedUserModel = JSON.stringify(userModel);
			callback(null, serializedUserModel);
		} catch (error) {
			callback(error);
		}
	});

	passport.deserializeUser(function(serializedUserModel, callback) {
		try {
			var deserializedUserModel = JSON.parse(serializedUserModel);
			callback(null, deserializedUserModel);
		} catch(error) {
			callback(error);
		}
	});


	return app;
};
