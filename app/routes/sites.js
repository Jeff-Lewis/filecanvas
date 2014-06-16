module.exports = (function() {
	'use strict';

	var express = require('express');
	var passport = require('passport'),
		LocalStrategy = require('passport-local').Strategy;

	var globals = require('../globals');
	var dropboxService = require('../globals').dropboxService;
	var dataService = require('../globals').dataService;

	var OrganizationService = require('../services/OrganizationService');
	var SiteService = require('../services/SiteService');
	var ResponseService = require('../services/ResponseService');
	var SiteTemplateService = require('../services/SiteTemplateService');
	var AuthenticationService = require('../services/AuthenticationService');

	var app = express();

	passport.use('site/local', new LocalStrategy({ passReqToCallback: true }, siteAuth));
	globals.passport.serializers['site'] = serializeSiteAuthUser;
	globals.passport.deserializers['site'] = deserializeSiteAuthUser;


	app.get('/:organization', defaultRoute);
	app.get('/:organization/login', defaultLoginRoute);
	app.post('/:organization/login', defaultLoginRoute);
	app.get('/:organization/download/*', defaultDownloadRoute);

	app.get('/:organization/:site/login', loginAuthCheck, loginRoute);
	app.post('/:organization/:site/login', processLoginRoute);

	app.get('/:organization/:site', ensureAuth, siteRoute);
	app.get('/:organization/:site/download/*', ensureAuth, downloadRoute);

	return app;

	function processLoginRoute(req, res, next) {
		passport.authenticate('site/local', function(error, user, info) {
			if (error) { return next(error); }
			var loginWasSuccessful = Boolean(user);
			var requestPath = req.originalUrl.split('?')[0];
			if (loginWasSuccessful) {
				req.logIn(user, function(error) {
					if (error) { return next(error); }
					var redirectParam = req.param('redirect');
					var redirectUrl = (redirectParam || requestPath.substr(0, requestPath.lastIndexOf('/login')) || '/');
					return res.redirect(redirectUrl);
				});
			} else {
				var siteLoginUrl = requestPath;
				return res.redirect(siteLoginUrl);
			}
		})(req, res, next);
	}

	function ensureAuth(req, res, next) {
		if (req.isAuthenticated()) { return next(); }

		var organizationAlias = req.params.organization;
		var siteAlias = req.params.site;

		var siteService = new SiteService(dataService, dropboxService);
		siteService.retrieveAuthenticationDetails(organizationAlias, siteAlias, function(error, authenticationDetails) {
			if (error) { return next(error); }

			var isPublic = authenticationDetails['public'];
			if (isPublic) { return next(); }

			var requestPath = req.originalUrl.split('?')[0];

			// TODO: Generate login link correctly for download URLs
			var siteLoginUrl = '/login';
			var isDownloadLink = (requestPath.indexOf('/download') === 0);
			if (isDownloadLink) {
				siteLoginUrl += '?redirect=' + encodeURIComponent(requestPath);
			} else {
				siteLoginUrl = (requestPath === '/' ? '' : requestPath) + siteLoginUrl;
			}
			res.redirect(siteLoginUrl);
		});
	}

	function loginAuthCheck(req, res, next) {
		if (req.isAuthenticated()) {
			var requestPath = req.originalUrl.split('?')[0];
			var redirectParam = req.param('redirect');
			var redirectUrl = (redirectParam || requestPath.substr(0, requestPath.lastIndexOf('/login')) || '/');
			return res.redirect(redirectUrl);
		}
		return next();
	}

	function siteAuth(req, username, password, callback) {
		var organizationAlias = req.params.organization;
		var siteAlias = req.params.site;

		var siteService = new SiteService(dataService, dropboxService);
		siteService.retrieveAuthenticationDetails(organizationAlias, siteAlias, function(error, authenticationDetails) {
			if (error) { return callback && callback(error); }

			var isPublic = authenticationDetails['public'];
			if (isPublic) { return callback && callback(null, true); }

			var validUsers = authenticationDetails.users;
			var authenticationService = new AuthenticationService();
			var siteUserModel = authenticationService.authenticate(username, password, validUsers);

			if (!siteUserModel) { return callback && callback(null, false); }

			var passportUser = {
				type: 'site',
				organization: organizationAlias,
				site: siteAlias,
				model: siteUserModel
			};
			return callback && callback(null, passportUser);
		});
	}

	function serializeSiteAuthUser(passportUser, callback) {
		var serializedUser = JSON.stringify({
			organization: passportUser.organization,
			site: passportUser.site,
			username: passportUser.model.username
		});
		return callback && callback(null, serializedUser);
	}

	function deserializeSiteAuthUser(serializedUser, callback) {
		var deserializedUser = JSON.parse(serializedUser);
		var organizationAlias = deserializedUser.organization;
		var siteAlias = deserializedUser.site;
		var username = deserializedUser.username;

		var siteService = new SiteService(dataService, dropboxService);
		siteService.retrieveAuthenticationDetails(organizationAlias, siteAlias, function(error, authenticationDetails) {
			if (error) { return callback && callback(error); }

			var validUsers = authenticationDetails.users;
			var matchedUsers = validUsers.filter(function(validUser) {
				return validUser.username === username;
			});

			if (matchedUsers.length === 0) {
				error = new Error('Username not found: "' + username + '"');
				return callback && callback(error);
			}

			var siteUserModel = matchedUsers[0];
			var passportUser = {
				type: 'site',
				organization: organizationAlias,
				site: siteAlias,
				model: siteUserModel
			};
			return callback && callback(null, passportUser);
		});
	}

	function defaultRoute(req, res, next) {
		var organizationAlias = req.params.organization;
		var organizationService = new OrganizationService(dataService);

		organizationService.retrieveOrganizationDefaultSiteAlias(organizationAlias, function(error, siteAlias) {
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

	function defaultLoginRoute(req, res, next) {
		var organizationAlias = req.params.organization;
		var organizationService = new OrganizationService(dataService);

		organizationService.retrieveOrganizationDefaultSiteAlias(organizationAlias, function(error, siteAlias) {
			if (error) { return next(error); }
			if (!siteAlias) {
				error = new Error();
				error.status = 404;
				return next(error);
			}

			req.url = '/' + organizationAlias + '/' + siteAlias + '/login';
			next();
		});
	}

	function defaultDownloadRoute(req, res, next) {
		var organizationAlias = req.params.organization;
		var organizationService = new OrganizationService(dataService);
		var downloadPath = req.params[0];

		organizationService.retrieveOrganizationDefaultSiteAlias(organizationAlias, function(error, siteAlias) {
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
			res.redirect(downloadUrl);
		}
	}

	function siteRoute(req, res, next) {
		var organizationAlias = req.params.organization;
		var siteAlias = req.params.site;

		var siteService = new SiteService(dataService, dropboxService);

		var includeContents = true;
		var includeUsers = false;
		var includeDomains = false;
		siteService.retrieveSite(organizationAlias, siteAlias, includeContents, includeUsers, includeDomains, _handleSiteModelLoaded);


		function _handleSiteModelLoaded(error, siteModel) {
			if (error) { return next(error); }

			new ResponseService({
				/*
				TODO: Sending JSON responses appears to confuse old versions of IE
				//	'json': function() {
				//		res.json(siteModel);
				//	},
				 */
				'html': function() {
					var hostname = req.get('host').split('.').slice(req.subdomains.length).join('.');
					var siteTemplateService = new SiteTemplateService(siteModel.template);
					var html = siteTemplateService.renderIndexPage(siteModel, hostname);
					res.send(html);
				}
			}).respondTo(req);
		}
	}

	function loginRoute(req, res, next) {
		var organizationAlias = req.params.organization;
		var siteAlias = req.params.site;

		var siteService = new SiteService(dataService, dropboxService);

		var includeContents = false;
		var includeUsers = false;
		var includeDomains = false;
		siteService.retrieveSite(organizationAlias, siteAlias, includeContents, includeUsers, includeDomains, _handleSiteModelLoaded);


		function _handleSiteModelLoaded(error, siteModel) {
			if (error) { return next(error); }

			new ResponseService({
				'html': function() {
					var hostname = req.get('host').split('.').slice(req.subdomains.length).join('.');
					var siteTemplateService = new SiteTemplateService(siteModel.template);
					var html = siteTemplateService.renderLoginPage(siteModel, hostname);
					res.send(html);
				}
			}).respondTo(req);
		}
	}
})();
