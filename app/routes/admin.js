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

	var config = require('../../config');
	var dataService = require('../globals').dataService;

	var app = express();

	var DEFAULT_TEMPLATE = config.templates['default'];

	var assetsRoot = path.resolve(path.dirname(require.main.filename), 'templates/admin/assets');
	var assetsMiddleware = express['static'](assetsRoot);
	app.use('/assets', assetsMiddleware);

	app.get('/', adminAuth, retrieveHomeRoute);
	app.get('/faq', adminAuth, retrieveFaqRoute);
	app.get('/support', adminAuth, retrieveSupportRoute);
	app.get('/account', adminAuth, retrieveAccountSettingsRoute);
	app.get('/logout', adminAuth, retrieveLogoutRoute);
	
	
	app.get('/organization', adminAuth, retrieveOrganizationSettingsRoute);
	app.get('/organization/shares', adminAuth, retrieveOrganizationShareListRoute);
	
	app.put('/organization', adminAuth, updateOrganizationRoute);
	app.del('/organization/shares/:share', adminAuth, deleteOrganizationShareRoute);
	

	app.get('/sites', adminAuth, retrieveSiteListRoute);
	app.get('/sites/add', adminAuth, retrieveSiteAddRoute);
	app.get('/sites/edit/:site', adminAuth, retrieveSiteEditRoute);
	app.get('/sites/edit/:site/users', adminAuth, retrieveSiteUsersEditRoute);

	app.post('/sites', adminAuth, createSiteRoute);
	app.put('/sites/:site', adminAuth, updateSiteRoute);
	app.del('/sites/:site', adminAuth, deleteSiteRoute);
	app.post('/sites/:site/users', adminAuth, createSiteUserRoute);
	app.del('/sites/:site/users/:username', adminAuth, deleteSiteUserRoute);


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
			var urlService = new UrlService(req);
			var adminUrls = _getAdminUrls(urlService, organizationModel);
			return {
				location: urlService.location,
				urls: adminUrls,
				user: administratorModel,
				organization: organizationModel,
				sites: siteModels
			};

			function _getAdminUrls(urlService, organizationModel) {
				return {
					home: urlService.getSubdomainUrl('www'),
					webroot: urlService.getSubdomainUrl(organizationModel.alias),
					domain: urlService.getSubdomainUrl('$0'),
					admin: '/',
					faq: '/faq',
					support: '/support',
					account: '/account',
					logout: '/logout',
					sites: '/sites',
					sitesAdd: '/sites/add',
					sitesEdit: '/sites/edit',
					organization: '/organization',
					organizationShares: '/organization/shares'
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
		var urlService = new UrlService(req);
		var currentSubdomain = urlService.subdomain;
		var sitesUrl = urlService.getSubdomainUrl(currentSubdomain, '/sites');
		res.redirect(sitesUrl);
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
		
		_outputAdminPage(adminTemplates.ACCOUNT, templateData, req, res);
	}


	function retrieveOrganizationSettingsRoute(req, res, next) {
		var organizationAlias = app.locals.session.organization.alias;
		var organizationService = new OrganizationService(dataService);
		organizationService.retrieveOrganizationAdministrators(organizationAlias, _handleOrganizationAdministratorsLoaded);

		function _handleOrganizationAdministratorsLoaded(error, administratorModels) {
			if (error) { return next(error); }

			var templateData = {
				title: 'Organization settings',
				session: app.locals.session,
				administrators: administratorModels
			};
			
			_outputAdminPage(adminTemplates.ORGANIZATION, templateData, req, res);
		}
	}

	function retrieveOrganizationShareListRoute(req, res, next) {
		var templateData = {
			title: 'Linked Dropbox folders',
			session: app.locals.session
		};
		_outputAdminPage(adminTemplates.ORGANIZATION_SHARES, templateData, req, res);
	}

	function updateOrganizationRoute(req, res, next) {
		var organizationAlias = app.locals.session.organization.alias;
		var organizationModel = {
			'alias': req.body.alias,
			'name': req.body.name,
			'email': req.body.email,
			'default': req.body['default'] || null
		};
		var organizationService = new OrganizationService(dataService);
		organizationService.updateOrganization(organizationAlias, organizationModel, _handleOrganizationUpdated);


		function _handleOrganizationUpdated(error, siteModel) {
			if (error) { return next(error); }
			var urlService = new UrlService(req);
			var currentSubdomain = urlService.subdomain;
			var siteUrl = urlService.getSubdomainUrl(currentSubdomain, '/organization');
			res.redirect(303, siteUrl);
		}
	}

	function deleteOrganizationShareRoute(req, res, next) {
		var organizationAlias = app.locals.session.organization.alias;
		var shareAlias = req.params.share;

		var organizationService = new OrganizationService(dataService);
		organizationService.deleteOrganizationShare(organizationAlias, shareAlias, _handleOrganizationShareDeleted);


		function _handleOrganizationShareDeleted(error, shareModel) {
			if (error) { return next(error); }
			var urlService = new UrlService(req);
			var currentSubdomain = urlService.subdomain;
			var sharesUrl = urlService.getSubdomainUrl(currentSubdomain, '/organization/shares');
			res.redirect(303, sharesUrl);
		}
	}


	function retrieveSiteListRoute(req, res, next) {
		var templateData = {
			title: 'Your sites',
			session: app.locals.session
		};
		_outputAdminPage(adminTemplates.SITES, templateData, req, res);
	}

	function retrieveSiteAddRoute(req, res, next) {
		var templateData = {
			title: 'Add a site',
			session: app.locals.session
		};
		_outputAdminPage(adminTemplates.SITES_ADD, templateData, req, res);
	}

	function retrieveSiteEditRoute(req, res, next) {
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
			_outputAdminPage(adminTemplates.SITES_EDIT, templateData, req, res);
		}
	}

	function retrieveSiteUsersEditRoute(req, res, next) {
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
				title: 'Edit site users: ' + siteModel.name,
				session: app.locals.session,
				site: siteModel
			};
			_outputAdminPage(adminTemplates.SITES_EDIT_USERS, templateData, req, res);
		}
	}


	function createSiteRoute(req, res, next) {
		var organizationAlias = app.locals.session.organization.alias;

		// TODO: Allow user to set site theme when creating site
		// TODO: Allow user to set site users when creating site
		var siteModel = {
			'organization': organizationAlias,
			'alias': req.body.alias,
			'name': req.body.name,
			'title': req.body.title,
			'template': DEFAULT_TEMPLATE,
			'share': req.body.share || null,
			'public': (req.body['private'] !== 'true')
		};

		var siteService = new SiteService(dataService);
		siteService.createSite(siteModel, _handleSiteCreated);


		function _handleSiteCreated(error, siteModel) {
			if (error) { return next(error); }
			var urlService = new UrlService(req);
			var currentSubdomain = urlService.subdomain;
			var sitesUrl = urlService.getSubdomainUrl(currentSubdomain, '/sites/edit/' + siteModel.alias);
			res.redirect(303, sitesUrl);
		}
	}


	function updateSiteRoute(req, res, next) {
		var organizationAlias = app.locals.session.organization.alias;
		var siteAlias = req.params.site;

		var isPurgeRequest = (req.body._action === 'purge');
		if (isPurgeRequest) {
			_purgeSite(organizationAlias, siteAlias);
		} else {
			_updateSite(organizationAlias, siteAlias);
		}


		function _purgeSite(organizationAlias, siteAlias) {
			var cache = null;
			var siteService = new SiteService(dataService);
			siteService.updateSiteCache(organizationAlias, siteAlias, cache, _handleCacheUpdated);


			function _handleCacheUpdated(error) {
				if (error) { return next(error); }
				var urlService = new UrlService(req);
				var currentSubdomain = urlService.subdomain;
				var siteUrl = urlService.getSubdomainUrl(currentSubdomain, '/sites/edit/' + siteAlias);
				res.redirect(303, siteUrl);
			}
		}

		function _updateSite(organizationAlias, siteAlias) {

			// TODO: Allow user to update site theme
			// TODO: Allow user to update site users
			var siteModel = {
				'organization': organizationAlias,
				'alias': req.body.alias,
				'name': req.body.name,
				'title': req.body.title,
				'template': DEFAULT_TEMPLATE,
				'share': req.body.share || null,
				'public': (req.body['private'] !== 'true')
			};
			
			var siteService = new SiteService(dataService);
			siteService.updateSite(organizationAlias, siteAlias, siteModel, _handleSiteUpdated);


			function _handleSiteUpdated(error, siteModel) {
				if (error) { return next(error); }
				var urlService = new UrlService(req);
				var currentSubdomain = urlService.subdomain;
				var siteUrl = urlService.getSubdomainUrl(currentSubdomain, '/sites/edit/' + siteModel.alias);
				res.redirect(303, siteUrl);
			}
		}
	}

	function deleteSiteRoute(req, res, next) {
		var organizationAlias = app.locals.session.organization.alias;
		var siteAlias = req.params.site;

		var siteService = new SiteService(dataService);
		siteService.deleteSite(organizationAlias, siteAlias, _handleSiteDeleted);


		function _handleSiteDeleted(error, siteModel) {
			if (error) { return next(error); }
			var urlService = new UrlService(req);
			var currentSubdomain = urlService.subdomain;
			var sitesUrl = urlService.getSubdomainUrl(currentSubdomain, '/sites');
			res.redirect(303, sitesUrl);
		}
	}


	function createSiteUserRoute(req, res, next) {
		var organizationAlias = app.locals.session.organization.alias;
		var siteAlias = req.params.site;
		var username = req.body.username;
		var password = req.body.password;

		var siteService = new SiteService(dataService);
		siteService.createSiteUser(organizationAlias, siteAlias, username, password, _handleSiteUserCreated);


		function _handleSiteUserCreated(error, siteModel) {
			if (error) { return next(error); }
			var urlService = new UrlService(req);
			var currentSubdomain = urlService.subdomain;
			var sitesUrl = urlService.getSubdomainUrl(currentSubdomain, '/sites/edit/' + siteAlias + '/users');
			res.redirect(303, sitesUrl);
		}
	}

	function deleteSiteUserRoute(req, res, next) {
		var organizationAlias = app.locals.session.organization.alias;
		var siteAlias = req.params.site;
		var username = req.params.username;

		var siteService = new SiteService(dataService);
		siteService.deleteSiteUser(organizationAlias, siteAlias, username, _handleSiteUserDeleted);


		function _handleSiteUserDeleted(error, siteModel) {
			if (error) { return next(error); }
			var urlService = new UrlService(req);
			var currentSubdomain = urlService.subdomain;
			var sitesUrl = urlService.getSubdomainUrl(currentSubdomain, '/sites/edit/' + siteAlias + '/users');
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
