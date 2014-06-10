module.exports = (function() {
	'use strict';

	var path = require('path');
	var express = require('express');
	var passport = require('passport'),
		LocalStrategy = require('passport-local').Strategy;

	var AuthenticationService = require('../services/AuthenticationService');
	var OrganizationService = require('../services/OrganizationService');
	var SiteService = require('../services/SiteService');
	var UrlService = require('../services/UrlService');
	var ResponseService = require('../services/ResponseService');

	var adminTemplates = require('../templates/adminTemplates');
	var faqData = require('../../templates/admin/faq.json');

	var config = require('../../config');
	var globals = require('../globals');
	var dataService = globals.dataService;

	var app = express();

	var DEFAULT_TEMPLATE = config.templates['default'];

	var assetsRoot = path.resolve(path.dirname(require.main.filename), 'templates/admin/assets');
	var assetsMiddleware = express['static'](assetsRoot);
	app.use('/assets', assetsMiddleware);

	passport.use('admin/local', new LocalStrategy(adminAuth));
	globals.passport.serializers['admin'] = serializeAdminAuthUser;
	globals.passport.deserializers['admin'] = deserializeAdminAuthUser;

	app.get('/login', loginAuthCheck, initAdminSession, retrieveLoginRoute);
	app.post('/login', passport.authenticate('admin/local', { successRedirect: '/', failureRedirect: '/login' }));
	app.get('/logout', initAdminSession, retrieveLogoutRoute);


	app.get('/', ensureAuth, initAdminSession, retrieveHomeRoute);
	app.get('/faq', ensureAuth, initAdminSession, retrieveFaqRoute);
	app.get('/support', ensureAuth, initAdminSession, retrieveSupportRoute);
	app.get('/account', ensureAuth, initAdminSession, retrieveAccountSettingsRoute);


	app.get('/organization', ensureAuth, initAdminSession, retrieveOrganizationSettingsRoute);
	app.get('/organization/shares', ensureAuth, initAdminSession, retrieveOrganizationShareListRoute);
	app.get('/organization/users', ensureAuth, initAdminSession, retrieveOrganizationUserListRoute);
	app.get('/organization/users/add', ensureAuth, initAdminSession, retrieveOrganizationUserAddRoute);
	app.get('/organization/users/edit/:username', ensureAuth, initAdminSession, retrieveOrganizationUserEditRoute);

	app.put('/organization', ensureAuth, initAdminSession, updateOrganizationRoute);
	app.del('/organization/shares/:share', ensureAuth, initAdminSession, deleteOrganizationShareRoute);
	app.post('/organization/users', ensureAuth, initAdminSession, createOrganizationUserRoute);
	app.put('/organization/users/:username', ensureAuth, initAdminSession, updateOrganizationUserRoute);
	app.put('/organization/users/:username/password', ensureAuth, initAdminSession, updateOrganizationUserPasswordRoute);
	app.del('/organization/users/:user', ensureAuth, initAdminSession, deleteOrganizationUserRoute);


	app.get('/sites', ensureAuth, initAdminSession, retrieveSiteListRoute);
	app.get('/sites/add', ensureAuth, initAdminSession, retrieveSiteAddRoute);
	app.get('/sites/edit/:site', ensureAuth, initAdminSession, retrieveSiteEditRoute);
	app.get('/sites/edit/:site/users', ensureAuth, initAdminSession, retrieveSiteUsersEditRoute);
	app.get('/sites/edit/:site/domains', ensureAuth, initAdminSession, retrieveSiteDomainsEditRoute);

	app.post('/sites', ensureAuth, initAdminSession, createSiteRoute);
	app.put('/sites/:site', ensureAuth, initAdminSession, updateSiteRoute);
	app.del('/sites/:site', ensureAuth, initAdminSession, deleteSiteRoute);
	app.post('/sites/:site/users', ensureAuth, initAdminSession, createSiteUserRoute);
	app.del('/sites/:site/users/:username', ensureAuth, initAdminSession, deleteSiteUserRoute);
	app.post('/sites/:site/domains', ensureAuth, initAdminSession, createSiteDomainRoute);
	app.del('/sites/:site/domains/:domain', ensureAuth, initAdminSession, deleteSiteDomainRoute);

	return app;


	function adminAuth(username, password, callback) {
		_retrieveAdministratorDetails(username, _handleAdministratorLoaded);


		function _handleAdministratorLoaded(error, administratorModel) {
			var userExists = (!(error && (error.status === 404)));
			if (!userExists) { return callback && callback(null, false); }

			if (error) { return callback && callback(error); }

			var isAuthenticated = _authenticateAdministrator(username, password, administratorModel);
			if (!isAuthenticated) { return callback && callback(null, false); }

			var passportUser = {
				type: 'admin',
				model: administratorModel
			};
			return callback && callback(null, passportUser);
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
	}

	function ensureAuth(req, res, next) {
		if (req.isAuthenticated()) { return next(); }
		res.redirect('/login');
	}

	function loginAuthCheck(req, res, next) {
		if (req.isAuthenticated()) {
			return res.redirect('/');
		}
		return next();
	}

	function serializeAdminAuthUser(passportUser, callback) {
		var serializedUser = passportUser.model.username;
		return callback && callback(null, serializedUser);
	}

	function deserializeAdminAuthUser(serializedUser, callback) {
		var username = serializedUser;
		var organizationService = new OrganizationService(dataService);
		organizationService.retrieveAdministrator(username, _handleAdministratorLoaded);


		function _handleAdministratorLoaded(error, administratorModel) {
			if (error) { return callback && callback(error); }
			var passportUser = {
				type: 'admin',
				model: administratorModel
			};
			return callback && callback(null, passportUser);
		}
	}

	function initAdminSession(req, res, next) {
		if (req.user) {
			var administratorModel = req.user.model;
			_retrieveSessionData(req, administratorModel, _handleSessionDataLoaded);
		} else {
			var sessionModel = _getAnonymousSessionData();
			_handleSessionDataLoaded(null, sessionModel);
		}


		function _handleSessionDataLoaded(error, sessionModel) {
			if (error) { return next(error); }
			app.locals.session = sessionModel;
			return next();
		}

		function _getAnonymousSessionData() {
			var administratorModel = null;
			var organizationModel = null;
			var siteModels = null;
			return _getSessionData(req, administratorModel, organizationModel, siteModels);
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
		}
	}

	function _getSessionData(req, administratorModel, organizationModel, siteModels) {
		var urlService = new UrlService(req);
		var adminUrls = _getAdminUrls(urlService, organizationModel);
		return {
			location: urlService.location,
			urls: adminUrls,
			user: administratorModel || null,
			organization: organizationModel || null,
			sites: siteModels || null
		};

		function _getAdminUrls(urlService, organizationModel) {
			return {
				webroot: (organizationModel ? urlService.getSubdomainUrl(organizationModel.alias) : null),
				domain: urlService.getSubdomainUrl('$0'),
				admin: '/',
				faq: '/faq',
				support: '/support',
				account: '/account',
				login: '/login',
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

	function retrieveLoginRoute(req, res, next) {
		var htmlTemplate = adminTemplates.LOGIN;
		var templateData = {
			title: 'Login',
			session: app.locals.session,
			content: null
		};

		new ResponseService({
			'html': function() {
				var html = htmlTemplate(templateData);
				res.send(html);
			}
		}).respondTo(req);
	}

	function retrieveLogoutRoute(req, res, next) {
		req.logout();
		res.redirect('/');
	}

	function retrieveHomeRoute(req, res, next) {
		res.redirect('/sites');
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
			res.redirect(303, '/organization');
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
			res.redirect(303, '/organization/users');
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
			res.redirect(303, '/organization/users');
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
			res.redirect(303, '/organization/users');
		}
	}

	function deleteOrganizationShareRoute(req, res, next) {
		var organizationAlias = app.locals.session.organization.alias;
		var shareAlias = req.params.share;

		var organizationService = new OrganizationService(dataService);
		organizationService.deleteOrganizationShare(organizationAlias, shareAlias, _handleOrganizationShareDeleted);


		function _handleOrganizationShareDeleted(error, shareModel) {
			if (error) { return next(error); }
			res.redirect(303, '/organization/shares');
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
			res.redirect(303, '/organization/users');
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
		var includeDomains = true;
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
			res.redirect(303, '/sites/edit/' + siteModel.alias);
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
				res.redirect(303, '/sites/edit/' + siteAlias);
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
				res.redirect(303, '/sites/edit/' + siteModel.alias);
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
			res.redirect(303, '/sites');
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
			res.redirect(303, '/sites/edit/' + siteAlias + '/users');
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
			res.redirect(303, '/sites/edit/' + siteAlias + '/users');
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
			res.redirect(303, '/sites/edit/' + siteAlias + '/domains');
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
			res.redirect(303, '/sites/edit/' + siteAlias + '/domains');
		}
	}


	function _outputAdminPage(htmlTemplate, templateData, req, res) {
		new ResponseService({
			/*
			TODO: Sending JSON responses appears to confuse old versions of IE
			'json': function() {
				res.json(templateData && templateData.content);
			},
			*/
			'html': function() {
				var html = htmlTemplate(templateData);
				res.send(html);
			}
		}).respondTo(req);
	}
})();
