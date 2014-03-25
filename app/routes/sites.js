module.exports = (function() {
	'use strict';

	var express = require('express');

	var dropboxService = require('../globals').dropboxService;
	var dataService = require('../globals').dataService;

	var OrganizationService = require('../services/OrganizationService');
	var SiteService = require('../services/SiteService');
	var ResponseService = require('../services/ResponseService');
	var SiteTemplateService = require('../services/SiteTemplateService');
	var AuthenticationService = require('../services/AuthenticationService');

	var app = express();

	app.get('/:organization', defaultRoute);
	app.get('/:organization/download/*', defaultDownloadRoute);
	app.get('/:organization/:site', siteAuth, siteRoute);
	app.get('/:organization/:site/download/*', siteAuth, downloadRoute);

	return app;


	function siteAuth(req, res, next) {
		var organizationAlias = req.params.organization;
		var siteAlias = req.params.site;

		var siteService = new SiteService(dataService, dropboxService);

		siteService.retrieveAuthenticationDetails(organizationAlias, siteAlias, function(error, authenticationDetails, callback) {
			if (error) { return next(error); }

			var isPublic = authenticationDetails['public'];
			if (isPublic) { return next(); }

			express.basicAuth(function(username, password) {
				var validUsers = authenticationDetails.users;
				var authenticationService = new AuthenticationService();
				return authenticationService.authenticate(username, password, validUsers);
			})(req, res, next);
		});
	}

	function defaultRoute(req, res, next) {
		var organizationAlias = req.params.organization;
		var organizationAliasService = new OrganizationService(dataService);

		organizationAliasService.retrieveDefaultSiteName(organizationAlias, function(error, siteAlias) {
			if (error) { return next(error); }
			if (!siteAlias) {
				error = new Error();
				error.status = 404;
				return next(error);
			}

			req.url += '/' + siteAlias;
			next();
		});
	}

	function defaultDownloadRoute(req, res, next) {
		var organizationAlias = req.params.organization;
		var organizationAliasService = new OrganizationService(dataService);
		var downloadPath = req.params[0];

		organizationAliasService.retrieveDefaultSiteName(organizationAlias, function(error, siteAlias) {
			if (error) { return next(error); }
			if (!siteAlias) {
				error = new Error();
				error.status = 404;
				return next(error);
			}

			req.url = '/' + organizationAlias + '/' + siteAlias + '/download/' + downloadPath;
			next();
		});
	}

	function downloadRoute(req, res, next) {
		var organizationAlias = req.params.organization;
		var siteAlias = req.params.site;
		var downloadPath = req.params[0];

		var siteService = new SiteService(dataService, dropboxService);

		siteService.retrieveDownloadLink(organizationAlias, siteAlias, downloadPath, _handleDownloadLinkRetrieved);


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
		var organizationAlias = req.params.organization;
		var siteAlias = req.params.site;

		var siteService = new SiteService(dataService, dropboxService);

		var includeContents = true;
		siteService.retrieveSite(organizationAlias, siteAlias, includeContents, _handleSiteModelLoaded);


		function _handleSiteModelLoaded(error, siteModel) {
			if (error) { return next(error); }

			new ResponseService({
				'json': function() {
					res.json(siteModel);
				},
				'html': function() {
					var hostname = req.get('host').split('.').slice(req.subdomains.length).join('.');
					var siteTemplateService = new SiteTemplateService(siteModel.template);
					var html = siteTemplateService.render(siteModel, hostname);
					res.send(html);
				}
			}).respondTo(req);
		}
	}
})();
