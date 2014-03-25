module.exports = (function() {
	'use strict';

	var path = require('path');
	var express = require('express');

	var AuthenticationService = require('../services/AuthenticationService');
	var OrganizationService = require('../services/OrganizationService');
	var UrlService = require('../services/UrlService');

	var adminTemplates = require('../templates/adminTemplates');
	var faqData = require('../../templates/admin/faq.json');

	var dataService = require('../globals').dataService;

	var app = express();

	var assetsRoot = path.resolve(path.dirname(require.main.filename), 'templates/admin/assets');
	var assetsMiddleware = express['static'](assetsRoot);
	app.use('/assets', assetsMiddleware);

	app.get('/', adminAuth, retrieveHomeRoute);
	app.get('/faq', adminAuth, retrieveFaqRoute);
	app.get('/support', adminAuth, retrieveSupportRoute);
	app.get('/account', adminAuth, retrieveAccountSettingsRoute);
	app.get('/logout', adminAuth, retrieveLogoutRoute);
	app.get('/sites', adminAuth, retrieveSiteListRoute);
	app.get('/sites/:site', adminAuth, retrieveSiteDetailsRoute);


	return app;


	function adminAuth(req, res, next) {
		express.basicAuth(function(username, password, callback) {
			_retrieveAdministratorDetails(username, _handleAdministratorLoaded);


			function _handleAdministratorLoaded(error, administratorModel) {
				if (error && (error.status === 404)) { return callback && callback(null, false); }
				if (error) { return callback && callback(error); }

				var isAuthenticated = _authenticateAdministrator(username, password, administratorModel);
				if (!isAuthenticated) { return callback && callback(null, false); }

				_retrieveOrganizationDetails(administratorModel.organization, _handleOrganizationLoaded);

				function _handleOrganizationLoaded(error, organizationModel) {
					if (error) { return callback && callback(error); }
					var adminUrls = _getAdminUrls(req);
					app.locals.session = {
						urls: adminUrls,
						user: administratorModel,
						organization: organizationModel
					};
					return callback && callback(null, administratorModel);
				}

				function _getAdminUrls(req) {
					var urlService = new UrlService(req);
					return {
						home: urlService.getSubdomainUrl('www'),
						faq: '/faq',
						support: '/support',
						account: '/account',
						logout: '/logout',
						sites: '/sites'
					};
				}
			}
		})(req, res, next);


		function _retrieveAdministratorDetails(username, callback) {
			var organizationService = new OrganizationService(dataService);
			organizationService.retrieveAdministrator(username, callback);
		}

		function _authenticateAdministrator(username, password, administratorModel) {
			var validAuthenticationDetails = {
				username: administratorModel.username,
				password: administratorModel.password,
				salt: administratorModel.salt
			};
			var validUsers = [validAuthenticationDetails];
			var authenticationService = new AuthenticationService();
			var isAuthenticated = authenticationService.authenticate(username, password, validUsers);
			return isAuthenticated;
		}

		function _retrieveOrganizationDetails(organizationAlias, callback) {
			var organizationService = new OrganizationService(dataService);
			organizationService.retrieveOrganization(organizationAlias, callback);
		}
	}

	function retrieveLogoutRoute(req, res, next) {
		var session = app.locals.session;
		var homeUrl = session.urls.home;
		res.redirect(homeUrl);
	}

	function retrieveHomeRoute(req, res, next) {
		var templateData = {
			session: app.locals.session
		};
		var html = adminTemplates.HOME(templateData);
		res.send(html);
	}

	function retrieveFaqRoute(req, res, next) {
		var templateData = {
			session: app.locals.session,
			questions: faqData
		};
		var html = adminTemplates.FAQ(templateData);
		res.send(html);
	}

	function retrieveSupportRoute(req, res, next) {
		var templateData = {
			session: app.locals.session
		};
		var html = adminTemplates.SUPPORT(templateData);
		res.send(html);
	}

	function retrieveAccountSettingsRoute(req, res, next) {
		var templateData = {
			session: app.locals.session
		};
		var html = adminTemplates.ACCOUNT_SETTINGS(templateData);
		res.send(html);
	}

	function retrieveSiteListRoute(req, res, next) {
		var templateData = {
			session: app.locals.session
		};
		var html = adminTemplates.SITE_ADD(templateData);
		res.send(html);
	}

	function retrieveSiteDetailsRoute(req, res, next) {
		var templateData = {
			session: app.locals.session
		};
		var html = adminTemplates.SITE_DETAIL(templateData);
		res.send(html);
	}
})();
