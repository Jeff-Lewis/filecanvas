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

	app.get('/', adminAuth, initSession, retrieveHomeRoute);
	app.get('/faq', adminAuth, initSession, retrieveFaqRoute);
	app.get('/support', adminAuth, initSession, retrieveSupportRoute);
	app.get('/account', adminAuth, initSession, retrieveAccountSettingsRoute);
	app.get('/logout', adminAuth, initSession, retrieveLogoutRoute);
	
	app.get('/organization', adminAuth, initSession, retrieveOrganizationSettingsRoute);
	app.get('/organization/shares', adminAuth, initSession, retrieveOrganizationShareListRoute);
	app.get('/organization/users', adminAuth, initSession, retrieveOrganizationUserListRoute);
	app.get('/organization/users/add', adminAuth, initSession, retrieveOrganizationUserAddRoute);
	app.get('/organization/users/edit/:username', adminAuth, initSession, retrieveOrganizationUserEditRoute);
	
	app.put('/organization', adminAuth, initSession, updateOrganizationRoute);
	app.del('/organization/shares/:share', adminAuth, initSession, deleteOrganizationShareRoute);
	app.post('/organization/users', adminAuth, initSession, createOrganizationUserRoute);
	app.put('/organization/users/:username', adminAuth, initSession, updateOrganizationUserRoute);
	app.put('/organization/users/:username/password', adminAuth, initSession, updateOrganizationUserPasswordRoute);
	app.del('/organization/users/:user', adminAuth, initSession, deleteOrganizationUserRoute);
	

	app.get('/sites', adminAuth, initSession, retrieveSiteListRoute);
	app.get('/sites/add', adminAuth, initSession, retrieveSiteAddRoute);
	app.get('/sites/edit/:site', adminAuth, initSession, retrieveSiteEditRoute);
	app.get('/sites/edit/:site/users', adminAuth, initSession, retrieveSiteUsersEditRoute);
	app.get('/sites/edit/:site/domains', adminAuth, initSession, retrieveSiteDomainsEditRoute);

	app.post('/sites', adminAuth, initSession, createSiteRoute);
	app.put('/sites/:site', adminAuth, initSession, updateSiteRoute);
	app.del('/sites/:site', adminAuth, initSession, deleteSiteRoute);
	app.post('/sites/:site/users', adminAuth, initSession, createSiteUserRoute);
	app.del('/sites/:site/users/:username', adminAuth, initSession, deleteSiteUserRoute);
	app.post('/sites/:site/domains', adminAuth, initSession, createSiteDomainRoute);
	app.del('/sites/:site/domains/:domain', adminAuth, initSession, deleteSiteDomainRoute);


	return app;

	function initSession(req, res, next) {
		var administratorModel = req.user;
		_retrieveSessionData(req, administratorModel, _handleSessionDataLoaded);

		function _handleSessionDataLoaded(error, sessionModel) {
			if (error) { return next(error); }
			app.locals.session = sessionModel;
			next();
		}


		function _retrieveSessionData(req, administratorModel, callback) {
			_retrieveOrganizationDetails(administratorModel.organization, _handleOrganizationDetailsLoaded);

			function _handleOrganizationDetailsLoaded(error, organizationModel) {
				if (error) { return callback && callback(error); }
				
				_retrieveOrganizationSites(administratorModel.organization, _handleOrganizationSitesLoaded);

				function _handleOrganizationSitesLoaded(error, siteModels) {
					if (error) { return callback && callback(error); }

					var sessionModel = _getSessionData(req, administratorModel, organizationModel, siteModels);
					
					return callback && callback(null, sessionModel);
				}
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
						organizationShares: '/organization/shares',
						organizationUsers: '/organization/users',
						organizationUsersAdd: '/organization/users/add',
						organizationUsersEdit: '/organization/users/edit'
					};
				}
			}
		}
	}


	function adminAuth(req, res, next) {
		express.basicAuth(function(username, password, callback) {
			_retrieveAdministratorDetails(username, _handleAdministratorLoaded);


			function _handleAdministratorLoaded(error, administratorModel) {
				if (error && (error.status === 404)) { return callback && callback(null, false); }
				if (error) { return callback && callback(error); }

				var isAuthenticated = _authenticateAdministrator(username, password, administratorModel);
				if (!isAuthenticated) { return callback && callback(null, false); }

				return callback && callback(null, administratorModel);
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
			content: {
				questions: faqData
			}
		};
		_outputAdminPage(adminTemplates.FAQ, templateData, req, res);
	}

	function retrieveSupportRoute(req, res, next) {
		var templateData = {
			title: 'Support',
			session: app.locals.session,
			content: null
		};
		_outputAdminPage(adminTemplates.SUPPORT, templateData, req, res);
	}

	function retrieveAccountSettingsRoute(req, res, next) {
		var templateData = {
			title: 'Your account',
			session: app.locals.session,
			content: {
				user: app.locals.session.user
			}
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
				content: {
					organization: app.locals.session.organization,
					administrators: administratorModels
				}
			};
			
			_outputAdminPage(adminTemplates.ORGANIZATION, templateData, req, res);
		}
	}

	function retrieveOrganizationShareListRoute(req, res, next) {
		var templateData = {
			title: 'Linked Dropbox folders',
			session: app.locals.session,
			content: {
				shares: app.locals.session.organization.shares
			}
		};
		_outputAdminPage(adminTemplates.ORGANIZATION_SHARES, templateData, req, res);
	}

	function retrieveOrganizationUserListRoute(req, res, next) {
		var organizationAlias = app.locals.session.organization.alias;

		var organizationService = new OrganizationService(dataService);
		organizationService.retrieveOrganizationAdministrators(organizationAlias, _handleOrganizationUsersLoaded);


		function _handleOrganizationUsersLoaded(error, administratorModels) {
			if (error) { return next(error); }
			var templateData = {
				title: 'Organization user accounts',
				session: app.locals.session,
				content: {
					users: administratorModels
				}
			};
			_outputAdminPage(adminTemplates.ORGANIZATION_USERS, templateData, req, res);
		}
	}

	function retrieveOrganizationUserAddRoute(req, res, next) {
		var templateData = {
			title: 'Add a user',
			session: app.locals.session,
			content: null
		};
		_outputAdminPage(adminTemplates.ORGANIZATION_USERS_ADD, templateData, req, res);
	}

	function retrieveOrganizationUserEditRoute(req, res, next) {
		var organizationAlias = app.locals.session.organization.alias;
		var username = req.params.username;

		var organizationService = new OrganizationService(dataService);
		organizationService.retrieveOrganizationAdministrator(organizationAlias, username, _handleOrganizationUserLoaded);


		function _handleOrganizationUserLoaded(error, administratorModel) {
			var templateData = {
				title: 'User account settings',
				session: app.locals.session,
				content: {
					user: administratorModel
				}
			};
			_outputAdminPage(adminTemplates.ORGANIZATION_USERS_EDIT, templateData, req, res);
		}
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

	function createOrganizationUserRoute(req, res, next) {
		var organizationAlias = app.locals.session.organization.alias;
		var administratorModel = {
			'organization': organizationAlias,
			'username': req.body.email,
			'email': req.body.email,
			'name': req.body.name,
			'password': req.body.password
		};
		var organizationService = new OrganizationService(dataService);
		organizationService.createOrganizationAdministrator(administratorModel, _handleOrganizationAdministratorCreated);


		function _handleOrganizationAdministratorCreated(error, administratorModel) {
			if (error) { return next(error); }
			var urlService = new UrlService(req);
			var currentSubdomain = urlService.subdomain;
			var siteUrl = urlService.getSubdomainUrl(currentSubdomain, '/organization/users');
			res.redirect(303, siteUrl);
		}
	}

	function updateOrganizationUserRoute(req, res, next) {
		var organizationAlias = app.locals.session.organization.alias;
		var username = req.params.username;
		var administratorModel = {
			'organization': organizationAlias,
			'username': req.body.email,
			'email': req.body.email,
			'name': req.body.name
		};
		var organizationService = new OrganizationService(dataService);
		organizationService.updateOrganizationAdministrator(organizationAlias, username, administratorModel, _handleOrganizationAdministratorUpdated);


		function _handleOrganizationAdministratorUpdated(error, administratorModel) {
			if (error) { return next(error); }
			var urlService = new UrlService(req);
			var currentSubdomain = urlService.subdomain;
			var siteUrl = urlService.getSubdomainUrl(currentSubdomain, '/organization/users');
			res.redirect(303, siteUrl);
		}
	}

	function updateOrganizationUserPasswordRoute(req, res, next) {
		var organizationAlias = app.locals.session.organization.alias;
		var username = req.params.username;
		var passwordCurrent = req.body['password-current'];
		var passwordNew = req.body['password-new'];
		var passwordConfirm = req.body['password-confirm'];

		if (passwordNew !== passwordConfirm) {
			var error = new Error('Supplied passwords do not match');
			error.status = 400;
			next(error);
		}

		var administratorModel = {
			'username': username,
			'password': passwordNew
		};

		var organizationService = new OrganizationService(dataService);
		organizationService.updateOrganizationAdministratorPassword(organizationAlias, username, passwordCurrent, administratorModel, _handleOrganizationAdministratorUpdated);


		function _handleOrganizationAdministratorUpdated(error, administratorModel) {
			if (error) { return next(error); }
			var urlService = new UrlService(req);
			var currentSubdomain = urlService.subdomain;
			var siteUrl = urlService.getSubdomainUrl(currentSubdomain, '/organization/users');
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

	function deleteOrganizationUserRoute(req, res, next) {
		var organizationAlias = app.locals.session.organization.alias;
		var username = req.params.user;

		var isCurrentUser = (username === app.locals.session.user.username);
		if (isCurrentUser) {
			// TODO: Warn if deleting the current user account
			var error = new Error('Cannot delete the currently logged-in user');
			error.status = 403;
			next(error);
		}

		var organizationService = new OrganizationService(dataService);
		organizationService.deleteOrganizationAdministrator(organizationAlias, username, _handleOrganizationUserDeleted);


		function _handleOrganizationUserDeleted(error, shareModel) {
			if (error) { return next(error); }
			var urlService = new UrlService(req);
			var currentSubdomain = urlService.subdomain;
			var sharesUrl = urlService.getSubdomainUrl(currentSubdomain, '/organization/users');
			res.redirect(303, sharesUrl);
		}
	}


	function retrieveSiteListRoute(req, res, next) {
		var templateData = {
			title: 'Your sites',
			session: app.locals.session,
			content: {
				sites: app.locals.session.sites
			}
		};
		_outputAdminPage(adminTemplates.SITES, templateData, req, res);
	}

	function retrieveSiteAddRoute(req, res, next) {
		var templateData = {
			title: 'Add a site',
			session: app.locals.session,
			content: null
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
		var includeDomains = false;
		siteService.retrieveSite(organizationAlias, siteAlias, includeContents, includeUsers, includeDomains, _handleSiteDetailsLoaded);

		function _handleSiteDetailsLoaded(error, siteModel) {
			if (error) { return next(error); }
			var templateData = {
				title: 'Edit site: ' + siteModel.name,
				session: app.locals.session,
				content: {
					site: siteModel
				}
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
		var includeDomains = true;
		siteService.retrieveSite(organizationAlias, siteAlias, includeContents, includeUsers, includeDomains, _handleSiteDetailsLoaded);

		function _handleSiteDetailsLoaded(error, siteModel) {
			if (error) { return next(error); }
			var templateData = {
				title: 'Edit site users: ' + siteModel.name,
				session: app.locals.session,
				content: {
					site: siteModel
				}
			};
			_outputAdminPage(adminTemplates.SITES_EDIT_USERS, templateData, req, res);
		}
	}

	function retrieveSiteDomainsEditRoute(req, res, next) {
		var session = app.locals.session;
		
		var organizationModel = session.organization;
		var organizationAlias = organizationModel.alias;
		var siteAlias = req.params.site;

		var siteService = new SiteService(dataService);
		var includeContents = false;
		var includeUsers = false;
		var includeDomains = true;
		siteService.retrieveSite(organizationAlias, siteAlias, includeContents, includeUsers, includeDomains, _handleSiteDetailsLoaded);

		function _handleSiteDetailsLoaded(error, siteModel) {
			if (error) { return next(error); }
			var templateData = {
				title: 'Edit site domains: ' + siteModel.name,
				session: app.locals.session,
				content: {
					site: siteModel
				}
			};
			_outputAdminPage(adminTemplates.SITES_EDIT_DOMAINS, templateData, req, res);
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


	function createSiteDomainRoute(req, res, next) {
		var organizationAlias = app.locals.session.organization.alias;
		var siteAlias = req.params.site;
		var domain = req.body.domain;

		var siteService = new SiteService(dataService);
		siteService.createSiteDomain(organizationAlias, siteAlias, domain, _handleSiteDomainCreated);


		function _handleSiteDomainCreated(error, siteModel) {
			if (error) { return next(error); }
			var urlService = new UrlService(req);
			var currentSubdomain = urlService.subdomain;
			var sitesUrl = urlService.getSubdomainUrl(currentSubdomain, '/sites/edit/' + siteAlias + '/domains');
			res.redirect(303, sitesUrl);
		}
	}

	function deleteSiteDomainRoute(req, res, next) {
		var organizationAlias = app.locals.session.organization.alias;
		var siteAlias = req.params.site;
		var domain = req.params.domain;

		var siteService = new SiteService(dataService);
		siteService.deleteSiteDomain(organizationAlias, siteAlias, domain, _handleSiteDomainDeleted);


		function _handleSiteDomainDeleted(error, siteModel) {
			if (error) { return next(error); }
			var urlService = new UrlService(req);
			var currentSubdomain = urlService.subdomain;
			var sitesUrl = urlService.getSubdomainUrl(currentSubdomain, '/sites/edit/' + siteAlias + '/domains');
			res.redirect(303, sitesUrl);
		}
	}


	function _outputAdminPage(htmlTemplate, templateData, req, res) {
		new ResponseService({
			'json': function() {
				res.json(templateData.content);
			},
			'html': function() {
				var html = htmlTemplate(templateData);
				res.send(html);
			}
		}).respondTo(req);
	}
})();
