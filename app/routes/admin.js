module.exports = (function() {
	'use strict';

	var path = require('path');
	var express = require('express');

	var AuthenticationService = require('../services/AuthenticationService');
	var OrganizationService = require('../services/OrganizationService');
	var SiteService = require('../services/SiteService');
	var UrlService = require('../services/UrlService');
	var ResponseService = require('../services/ResponseService');

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
	app.get('/shares', adminAuth, retrieveShareListRoute);

	app.post('/sites', adminAuth, createSiteRoute);


	return app;


	function adminAuth(req, res, next) {
		express.basicAuth(function(username, password, callback) {
			_retrieveAdministratorDetails(username, _handleAdministratorLoaded);


			function _handleAdministratorLoaded(error, administratorModel) {
				if (error && (error.status === 404)) { return callback && callback(null, false); }
				if (error) { return callback && callback(error); }

				var isAuthenticated = _authenticateAdministrator(username, password, administratorModel);
				if (!isAuthenticated) { return callback && callback(null, false); }

				_retrieveOrganizationDetails(administratorModel.organization, _handleOrganizationDetailsLoaded);

				function _handleOrganizationDetailsLoaded(error, organizationModel) {
					if (error) { return callback && callback(error); }
					
					_retrieveOrganizationSites(administratorModel.organization, _handleOrganizationSitesLoaded);

					function _handleOrganizationSitesLoaded(error, siteModels) {
						if (error) { return callback && callback(error); }

						var session = _getSessionData(req, administratorModel, organizationModel, siteModels);
						app.locals.session = session;
						
						return callback && callback(null, administratorModel);
					}
				}
			}
		})(req, res, next);
					
		function _getSessionData(req, administratorModel, organizationModel, siteModels) {
			var adminUrls = _getAdminUrls(req, organizationModel);
			return {
				navigation: [
					{
						id: 'faq',
						label: 'FAQ',
						link: adminUrls.faq,
						active: (req.path === adminUrls.faq)
					},
					{
						id: 'support',
						label: 'Support',
						link: adminUrls.support,
						active: (req.path === adminUrls.support)
					}
				],
				urls: adminUrls,
				user: administratorModel,
				organization: organizationModel,
				sites: siteModels
			};

			function _getAdminUrls(req, organizationModel) {
				var urlService = new UrlService(req);
				return {
					home: urlService.getSubdomainUrl('www'),
					organization: urlService.getSubdomainUrl(organizationModel.alias),
					admin: '/',
					faq: '/faq',
					support: '/support',
					account: '/account',
					logout: '/logout',
					sites: '/sites',
					shares: '/shares'
				};
			}
		}


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
			var includeShares = true;
			organizationService.retrieveOrganization(organizationAlias, includeShares, callback);
		}

		function _retrieveOrganizationSites(organizationAlias, callback) {
			var organizationService = new OrganizationService(dataService);
			organizationService.retrieveOrganizationSites(organizationAlias, callback);
		}
	}

	function retrieveLogoutRoute(req, res, next) {
		var urlService = new UrlService(req);
		var homeUrl = urlService.getSubdomainUrl('www');
		res.redirect(homeUrl);
	}

	function retrieveHomeRoute(req, res, next) {
		var templateData = {
			title: null,
			session: app.locals.session
		};
		_outputAdminPage(adminTemplates.HOME, templateData, req, res);
	}

	function retrieveFaqRoute(req, res, next) {
		var templateData = {
			title: 'FAQ',
			session: app.locals.session,
			questions: faqData
		};
		_outputAdminPage(adminTemplates.FAQ, templateData, req, res);
	}

	function retrieveSupportRoute(req, res, next) {
		var templateData = {
			title: 'Support',
			session: app.locals.session
		};
		_outputAdminPage(adminTemplates.SUPPORT, templateData, req, res);
	}

	function retrieveAccountSettingsRoute(req, res, next) {
		var templateData = {
			title: 'Account settings',
			session: app.locals.session
		};
		
		_outputAdminPage(adminTemplates.ACCOUNT_SETTINGS, templateData, req, res);
	}

	function retrieveSiteListRoute(req, res, next) {
		var templateData = {
			title: 'Your sites',
			session: app.locals.session
		};
		_outputAdminPage(adminTemplates.SITE_ADD, templateData, req, res);
	}

	function retrieveSiteDetailsRoute(req, res, next) {
		var session = app.locals.session;
		
		var organizationModel = session.organization;
		var organizationAlias = organizationModel.alias;
		var siteAlias = req.params.site;

		var siteService = new SiteService(dataService);
		var includeContents = false;
		var includeUsers = true;
		siteService.retrieveSite(organizationAlias, siteAlias, includeContents, includeUsers, _handleSiteDetailsLoaded);

		function _handleSiteDetailsLoaded(error, siteModel) {
			if (error) { return next(error); }
			var templateData = {
				title: 'Edit site: ' + siteModel.name,
				session: app.locals.session,
				site: siteModel
			};
			_outputAdminPage(adminTemplates.SITE_DETAIL, templateData, req, res);
		}
	}

	function retrieveShareListRoute(req, res, next) {
		var templateData = {
			title: 'Linked Dropbox folders',
			session: app.locals.session
		};
		_outputAdminPage(adminTemplates.SHARES, templateData, req, res);
	}


	function createSiteRoute(req, res, next) {
		// TODO: Allow user to choose theme when creating site
		var siteModel = {
			'organization': req.body.organization,
			'alias': req.body.alias,
			'name': req.body.name,
			'title': req.body.title,
			'template': 'fathom',
			'sharePath': req.body.share || null,
			'public': (req.body['private'] !== 'true')
		};

		var siteService = new SiteService(dataService);
		siteService.createSite(siteModel, _handleSiteCreated);

		function _handleSiteCreated(error, siteModel) {
			if (error) { return next(error); }
			var urlService = new UrlService(req);
			var currentSubdomain = urlService.subdomain;
			var sitesUrl = urlService.getSubdomainUrl(currentSubdomain, '/sites' + '/' + siteModel.alias);
			res.redirect(303, sitesUrl);
		}
	}


	function _outputAdminPage(htmlTemplate, templateData, req, res) {
		new ResponseService({
			'json': function() {
				res.json(templateData);
			},
			'html': function() {
				var html = htmlTemplate(templateData);
				res.send(html);
			}
		}).respondTo(req);
	}
})();
