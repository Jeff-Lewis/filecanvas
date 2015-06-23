'use strict';

var path = require('path');
var Promise = require('promise');
var express = require('express');
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;

var AuthenticationService = require('../services/AuthenticationService');
var OrganizationService = require('../services/OrganizationService');
var SiteService = require('../services/SiteService');
var UrlService = require('../services/UrlService');
var ResponseService = require('../services/ResponseService');

var adminTemplates = require('../templates/adminTemplates');
var faqData = require('../../templates/admin/faq.json');

var config = require('../../config');
var globals = require('../globals');

module.exports = function(dataService) {
	var app = express();

	var DEFAULT_SITE_TEMPLATE = config.templates['default'];

	var assetsRoot = path.resolve(path.dirname(require.main.filename), 'templates/admin/assets');
	var assetsMiddleware = express.static(assetsRoot);
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
		retrieveAdministratorDetails(username)
			.then(function(administratorModel) {
				var isAuthenticated = authenticateAdministrator(username, password, administratorModel);
				if (!isAuthenticated) {
					return callback(null, false);
				}

				var passportUser = {
					type: 'admin',
					model: administratorModel
				};
				return callback(null, passportUser);
			})
			.catch(function(error) {
				if (error.status === 404) {
					return callback(null, false);
				}
			})
			.catch(function(error) {
				return callback(error);
			});


		function retrieveAdministratorDetails(username, callback) {
			var organizationService = new OrganizationService(dataService);
			return organizationService.retrieveAdministrator(username);
		}

		function authenticateAdministrator(username, password, administratorModel) {
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
		if (req.isAuthenticated()) {
			next();
			return;
		}
		res.redirect('/login');
	}

	function loginAuthCheck(req, res, next) {
		if (req.isAuthenticated()) {
			return res.redirect('/');
		}
		next();
	}

	function serializeAdminAuthUser(passportUser, callback) {
		var serializedUser = passportUser.model.username;
		return callback && callback(null, serializedUser);
	}

	function deserializeAdminAuthUser(serializedUser, callback) {
		var username = serializedUser;
		var organizationService = new OrganizationService(dataService);
		return organizationService.retrieveAdministrator(username)
			.then(function(administratorModel) {
				var passportUser = {
					type: 'admin',
					model: administratorModel
				};
				return callback(null, passportUser);
			})
			.catch(function(error) {
				return callback(error);
			});
	}

	function initAdminSession(req, res, next) {
		loadSessionModel(req)
			.then(function(sessionModel) {
				app.locals.session = sessionModel;
				next();
			})
			.catch(function(error) {
				next(error);
			});


		function loadSessionModel(req) {
			if (req.user) {
				var administratorModel = req.user.model;
				return retrieveSessionData(req, administratorModel);
			} else {
				var sessionModel = getAnonymousSessionData();
				return Promise.resolve(sessionModel);
			}
		}

		function getAnonymousSessionData() {
			var administratorModel = null;
			var organizationModel = null;
			var siteModels = null;
			return getSessionData(req, administratorModel, organizationModel, siteModels);
		}

		function retrieveSessionData(req, administratorModel) {
			var organizationAlias = administratorModel.organization;
			return retrieveOrganizationDetails(organizationAlias)
				.then(function(organizationModel) {
					return retrieveOrganizationSites(organizationAlias)
						.then(function(siteModels) {
							var sessionModel = getSessionData(req, administratorModel, organizationModel, siteModels);
							return sessionModel;
						});
				});


			function retrieveOrganizationDetails(organizationAlias) {
				var organizationService = new OrganizationService(dataService);
				var includeShares = true;
				return organizationService.retrieveOrganization(organizationAlias, includeShares);
			}

			function retrieveOrganizationSites(organizationAlias) {
				var organizationService = new OrganizationService(dataService);
				return organizationService.retrieveOrganizationSites(organizationAlias);
			}
		}
	}

	function getSessionData(req, administratorModel, organizationModel, siteModels) {
		var urlService = new UrlService(req);
		var adminUrls = getAdminUrls(urlService, organizationModel);
		return {
			location: urlService.location,
			urls: adminUrls,
			user: administratorModel || null,
			organization: organizationModel || null,
			sites: siteModels || null
		};


		function getAdminUrls(urlService, organizationModel) {
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
		outputAdminPage(adminTemplates.FAQ, templateData, req, res);
	}

	function retrieveSupportRoute(req, res, next) {
		var templateData = {
			title: 'Support',
			session: app.locals.session,
			content: null
		};
		outputAdminPage(adminTemplates.SUPPORT, templateData, req, res);
	}

	function retrieveAccountSettingsRoute(req, res, next) {
		var templateData = {
			title: 'Your account',
			session: app.locals.session,
			content: {
				user: app.locals.session.user
			}
		};
		outputAdminPage(adminTemplates.ACCOUNT, templateData, req, res);
	}

	function retrieveOrganizationSettingsRoute(req, res, next) {
		var organizationAlias = app.locals.session.organization.alias;
		var organizationService = new OrganizationService(dataService);
		organizationService.retrieveOrganizationAdministrators(organizationAlias)
			.then(function(administratorModels) {
				var templateData = {
					title: 'Organization settings',
					session: app.locals.session,
					content: {
						organization: app.locals.session.organization,
						administrators: administratorModels
					}
				};
				outputAdminPage(adminTemplates.ORGANIZATION, templateData, req, res);
			})
			.catch(function(error) {
				next(error);
			});
	}

	function retrieveOrganizationShareListRoute(req, res, next) {
		var templateData = {
			title: 'Linked Dropbox folders',
			session: app.locals.session,
			content: {
				shares: app.locals.session.organization.shares
			}
		};
		outputAdminPage(adminTemplates.ORGANIZATION_SHARES, templateData, req, res);
	}

	function retrieveOrganizationUserListRoute(req, res, next) {
		var organizationAlias = app.locals.session.organization.alias;
		var organizationService = new OrganizationService(dataService);
		organizationService.retrieveOrganizationAdministrators(organizationAlias)
			.then(function(administratorModels) {
				var templateData = {
					title: 'Organization user accounts',
					session: app.locals.session,
					content: {
						users: administratorModels
					}
				};
				outputAdminPage(adminTemplates.ORGANIZATION_USERS, templateData, req, res);
			})
			.catch(function(error) {
				next(error);
			});
	}

	function retrieveOrganizationUserAddRoute(req, res, next) {
		var templateData = {
			title: 'Add a user',
			session: app.locals.session,
			content: null
		};
		outputAdminPage(adminTemplates.ORGANIZATION_USERS_ADD, templateData, req, res);
	}

	function retrieveOrganizationUserEditRoute(req, res, next) {
		var organizationAlias = app.locals.session.organization.alias;
		var username = req.params.username;

		var organizationService = new OrganizationService(dataService);
		organizationService.retrieveOrganizationAdministrator(organizationAlias, username)
			.then(function(administratorModel) {
				var templateData = {
					title: 'User account settings',
					session: app.locals.session,
					content: {
						user: administratorModel
					}
				};
				outputAdminPage(adminTemplates.ORGANIZATION_USERS_EDIT, templateData, req, res);
			})
			.catch(function(error) {
				next(error);
			});
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
		organizationService.updateOrganization(organizationAlias, organizationModel)
			.then(function(organizationModel) {
				res.redirect(303, '/organization');
			})
			.catch(function(error) {
				next(error);
			});
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
		organizationService.createOrganizationAdministrator(administratorModel)
			.then(function() {
				res.redirect(303, '/organization/users');
			})
			.catch(function(error) {
				next(error);
			});
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
		organizationService.updateOrganizationAdministrator(organizationAlias, username, administratorModel)
			.then(function() {
				res.redirect(303, '/organization/users');
			})
			.catch(function(error) {
				next(error);
			});
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
		organizationService.updateOrganizationAdministratorPassword(organizationAlias, username, passwordCurrent, administratorModel)
			.then(function() {
				res.redirect(303, '/organization/users');
			})
			.catch(function(error) {
				next(error);
			});
	}

	function deleteOrganizationShareRoute(req, res, next) {
		var organizationAlias = app.locals.session.organization.alias;
		var shareAlias = req.params.share;

		var organizationService = new OrganizationService(dataService);
		organizationService.deleteOrganizationShare(organizationAlias, shareAlias)
			.then(function() {
				res.redirect(303, '/organization/shares');
			})
			.catch(function(error) {
				next(error);
			});
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
		organizationService.deleteOrganizationAdministrator(organizationAlias, username)
			.then(function() {
				res.redirect(303, '/organization/users');
			})
			.catch(function(error) {
				next(error);
			});
	}

	function retrieveSiteListRoute(req, res, next) {
		var templateData = {
			title: 'Your sites',
			session: app.locals.session,
			content: {
				sites: app.locals.session.sites
			}
		};
		outputAdminPage(adminTemplates.SITES, templateData, req, res);
	}

	function retrieveSiteAddRoute(req, res, next) {
		var templateData = {
			title: 'Add a site',
			session: app.locals.session,
			content: null
		};
		outputAdminPage(adminTemplates.SITES_ADD, templateData, req, res);
	}

	function retrieveSiteEditRoute(req, res, next) {
		var organizationModel = app.locals.session.organization;
		var organizationAlias = organizationModel.alias;
		var siteAlias = req.params.site;

		var siteService = new SiteService(dataService);
		var includeContents = false;
		var includeUsers = true;
		var includeDomains = true;
		siteService.retrieveSite(organizationAlias, siteAlias, includeContents, includeUsers, includeDomains)
			.then(function(siteModel) {
				var templateData = {
					title: 'Edit site: ' + siteModel.name,
					session: app.locals.session,
					content: {
						site: siteModel
					}
				};
				outputAdminPage(adminTemplates.SITES_EDIT, templateData, req, res);
			})
			.catch(function(error) {
				next(error);
			});
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
		siteService.retrieveSite(organizationAlias, siteAlias, includeContents, includeUsers, includeDomains)
			.then(function(siteModel) {
				var templateData = {
					title: 'Edit site users: ' + siteModel.name,
					session: app.locals.session,
					content: {
						site: siteModel
					}
				};
				outputAdminPage(adminTemplates.SITES_EDIT_USERS, templateData, req, res);
			})
			.catch(function(error) {
				next(error);
			});
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
		siteService.retrieveSite(organizationAlias, siteAlias, includeContents, includeUsers, includeDomains)
			.then(function(siteModel) {
				var templateData = {
					title: 'Edit site domains: ' + siteModel.name,
					session: app.locals.session,
					content: {
						site: siteModel
					}
				};
				outputAdminPage(adminTemplates.SITES_EDIT_DOMAINS, templateData, req, res);
			})
			.catch(function(error) {
				next(error);
			});
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
			'template': DEFAULT_SITE_TEMPLATE,
			'share': req.body.share || null,
			'public': (req.body['private'] !== 'true')
		};

		var siteService = new SiteService(dataService);
		siteService.createSite(siteModel)
			.then(function(siteModel) {
				res.redirect(303, '/sites/edit/' + siteModel.alias);
			})
			.catch(function(error) {
				next(error);
			});
	}

	function updateSiteRoute(req, res, next) {
		var organizationAlias = app.locals.session.organization.alias;
		var siteAlias = req.params.site;

		var isPurgeRequest = (req.body._action === 'purge');
		if (isPurgeRequest) {
			purgeSite(organizationAlias, siteAlias);
		} else {

			// TODO: Allow user to update site theme when updating site

			var siteModel = {
				'organization': organizationAlias,
				'alias': req.body.alias,
				'name': req.body.name,
				'title': req.body.title,
				'template': DEFAULT_SITE_TEMPLATE,
				'share': req.body.share || null,
				'public': (req.body['private'] !== 'true')
			};
			updateSite(organizationAlias, siteAlias, siteModel);
		}


		function purgeSite(organizationAlias, siteAlias) {
			var cache = null;
			var siteService = new SiteService(dataService);
			siteService.updateSiteCache(organizationAlias, siteAlias, cache)
				.then(function() {
					res.redirect(303, '/sites/edit/' + siteAlias);
				})
				.catch(function(error) {
					next(error);
				});
		}

		function updateSite(organizationAlias, siteAlias, siteModel) {
			var siteService = new SiteService(dataService);
			siteService.updateSite(organizationAlias, siteAlias, siteModel)
				.then(function(siteModel) {
					res.redirect(303, '/sites/edit/' + siteModel.alias);
				})
				.catch(function(error) {
					next(error);
				});
		}
	}

	function deleteSiteRoute(req, res, next) {
		var organizationAlias = app.locals.session.organization.alias;
		var siteAlias = req.params.site;

		var siteService = new SiteService(dataService);
		siteService.deleteSite(organizationAlias, siteAlias)
			.then(function(siteModel) {
				res.redirect(303, '/sites');
			})
			.catch(function(error) {
				next(error);
			});
	}

	function createSiteUserRoute(req, res, next) {
		var organizationAlias = app.locals.session.organization.alias;
		var siteAlias = req.params.site;
		var username = req.body.username;
		var password = req.body.password;

		var siteService = new SiteService(dataService);
		siteService.createSiteUser(organizationAlias, siteAlias, username, password)
			.then(function(userModel) {
				res.redirect(303, '/sites/edit/' + siteAlias + '/users');
			})
			.catch(function(error) {
				next(error);
			});
	}

	function deleteSiteUserRoute(req, res, next) {
		var organizationAlias = app.locals.session.organization.alias;
		var siteAlias = req.params.site;
		var username = req.params.username;

		var siteService = new SiteService(dataService);
		siteService.deleteSiteUser(organizationAlias, siteAlias, username)
			.then(function() {
				res.redirect(303, '/sites/edit/' + siteAlias + '/users');
			})
			.catch(function(error) {
				next(error);
			});
	}

	function createSiteDomainRoute(req, res, next) {
		var organizationAlias = app.locals.session.organization.alias;
		var siteAlias = req.params.site;
		var domain = req.body.domain;

		var siteService = new SiteService(dataService);
		siteService.createSiteDomain(organizationAlias, siteAlias, domain)
			.then(function(domain) {
				res.redirect(303, '/sites/edit/' + siteAlias + '/domains');
			})
			.catch(function(error) {
				next(error);
			});
	}

	function deleteSiteDomainRoute(req, res, next) {
		var organizationAlias = app.locals.session.organization.alias;
		var siteAlias = req.params.site;
		var domain = req.params.domain;

		var siteService = new SiteService(dataService);
		siteService.deleteSiteDomain(organizationAlias, siteAlias, domain)
			.then(function() {
				res.redirect(303, '/sites/edit/' + siteAlias + '/domains');
			})
			.catch(function(error) {
				next(error);
			});
	}

	function outputAdminPage(htmlTemplate, templateData, req, res) {
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
};
