module.exports = (function() {
	'use strict';

	var express = require('express');
	var db = require('../../globals').db;
	var AppService = require('../../services/AppService');

	return function(req, res, next) {
		var appUser = req.params.username;
		var appName = req.params.app;

		express.basicAuth(function(username, password, callback) {
			var appService = new AppService(db, appUser, appName);
			appService.authenticateAppUser(username, password, callback);
		})(req, res, next);
	};
})();
