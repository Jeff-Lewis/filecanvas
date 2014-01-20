module.exports = (function() {
	'use strict';

	var express = require('express');
	var db = require('../../globals').db;
	var SiteService = require('../../services/SiteService');

	return function(req, res, next) {
		var siteOwner = req.params.username;
		var siteName = req.params.site;

		express.basicAuth(function(username, password, callback) {
			var siteService = new SiteService(db, siteOwner, siteName);
			siteService.authenticateSiteUser(username, password, callback);
		})(req, res, next);
	};
})();
