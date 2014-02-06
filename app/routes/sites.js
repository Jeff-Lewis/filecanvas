module.exports = (function() {
	'use strict';

	var express = require('express');

	var dropboxService = require('../globals').dropboxService;
	var dataService = require('../globals').dataService;

	var UserService = require('../services/UserService');
	var SiteService = require('../services/SiteService');
	var ResponseService = require('../services/ResponseService');
	var TemplateService = require('../services/TemplateService');
	var AuthenticationService = require('../services/AuthenticationService');

	var app = express();

	app.get('/:username', defaultRoute);
	app.get('/:username/download/*', defaultDownloadRoute);
	app.get('/:username/:site', siteAuth, siteRoute);
	app.get('/:username/:site/download/*', siteAuth, downloadRoute);

	return app;


	function siteAuth(req, res, next) {
		var siteOwner = req.params.username;
		var siteName = req.params.site;

		var siteService = new SiteService(dataService, dropboxService, siteOwner, siteName);

		siteService.getAuthenticationDetails(function(error, authentication, callback) {
			if (error) { return next(error); }

			var isPublic = authentication['public'];
			if (isPublic) { return next(); }

			express.basicAuth(function(username, password) {
				var validUsers = authentication.users;
				var authenticationService = new AuthenticationService();
				return authenticationService.authenticate(username, password, validUsers);
			})(req, res, next);
		});
	}

	function defaultRoute(req, res, next) {
		var siteOwner = req.params.username;
		var userService = new UserService(dataService);

		userService.retrieveDefaultSiteName(siteOwner, function(error, siteName) {
			if (error) { return next(error); }
			if (!siteName) {
				error = new Error();
				error.status = 404;
				return next(error);
			}

			req.url += '/' + siteName;
			next();
		});
	}

	function defaultDownloadRoute(req, res, next) {
		var siteOwner = req.params.username;
		var userService = new UserService(dataService);
		var downloadPath = req.params[0];

		userService.retrieveDefaultSiteName(siteOwner, function(error, siteName) {
			if (error) { return next(error); }
			if (!siteName) {
				error = new Error();
				error.status = 404;
				return next(error);
			}

			req.url = '/' + siteOwner + '/' + siteName + '/download/' + downloadPath;
			next();
		});
	}

	function downloadRoute(req, res, next) {
		var siteOwner = req.params.username;
		var siteName = req.params.site;
		var downloadPath = req.params[0];

		var siteService = new SiteService(dataService, dropboxService, siteOwner, siteName);

		siteService.retrieveDownloadLink(downloadPath, _handleDownloadLinkRetrieved);


		function _handleDownloadLinkRetrieved(error, downloadUrl) {
			if (error) { return next(error); }

			new ResponseService({
				'json': function() {
					res.json(downloadUrl);
				},
				'html': function() {
					res.redirect(downloadUrl);
				}
			}).respondTo(req);
		}
	}

	function siteRoute(req, res, next) {
		var siteOwner = req.params.username;
		var siteName = req.params.site;

		var siteService = new SiteService(dataService, dropboxService, siteOwner, siteName);

		var includeContents = true;
		siteService.retrieveSite(includeContents, _handleSiteModelLoaded);


		function _handleSiteModelLoaded(error, siteModel) {
			if (error) { return next(error); }

			new ResponseService({
				'json': function() {
					res.json(siteModel);
				},
				'html': function() {
					var hostname = req.get('host').split('.').slice(req.subdomains.length).join('.');
					var templateService = new TemplateService(siteModel.template);
					var html = templateService.render(siteModel, hostname);
					res.send(html);
				}
			}).respondTo(req);
		}
	}
})();
