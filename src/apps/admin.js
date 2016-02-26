'use strict';

var objectAssign = require('object-assign');
var express = require('express');
var composeMiddleware = require('compose-middleware').compose;

var faqApp = require('./admin/faq');
var supportApp = require('./admin/support');
var accountApp = require('./admin/account');
var sitesApp = require('./admin/sites');
var previewApp = require('./admin/preview');
var adaptersApp = require('./admin/adapters');
var templatesApp = require('./admin/templates');
var loginApp = require('./admin/login');

var adminAuth = require('./admin/middleware/adminAuth');

var session = require('../middleware/session');
var forms = require('../middleware/forms');
var sessionState = require('../middleware/sessionState');
var redirect = require('../middleware/redirect');
var invalidRoute = require('../middleware/invalidRoute');

var handlebarsEngine = require('../engines/handlebars');

var loadLoginAdapters = require('../utils/loadLoginAdapters');
var loadStorageAdapters = require('../utils/loadStorageAdapters');
var loadUploadAdapter = require('../utils/loadUploadAdapter');
var stripTrailingSlash = require('../utils/stripTrailingSlash');
var appendQueryParams = require('../utils/appendQueryParams');
var parseLocation = require('../utils/parseLocation');
var getSubdomainUrl = require('../utils/getSubdomainUrl');

var UserService = require('../services/UserService');

module.exports = function(database, cache, options) {
	options = options || {};
	var host = options.host;
	var cookieSecret = options.cookieSecret;
	var sessionStore = options.sessionStore;
	var sessionDuration = options.sessionDuration;
	var templatesPath = options.templatesPath;
	var partialsPath = options.partialsPath;
	var themesPath = options.themesPath;
	var faqPath = options.faqPath;
	var siteTemplatePath = options.siteTemplatePath;
	var adminAssetsUrl = options.adminAssetsUrl;
	var themesUrl = options.themesUrl;
	var wwwUrl = options.wwwUrl;
	var adaptersConfig = options.adapters;
	var siteAuthOptions = options.siteAuth;
	var uploadAdapterConfig = options.uploadAdapter;

	if (!database) { throw new Error('Missing database'); }
	if (!cache) { throw new Error('Missing key-value store'); }
	if (!host) { throw new Error('Missing host details'); }
	if (!cookieSecret) { throw new Error('Missing cookie secret'); }
	if (!sessionStore) { throw new Error('Missing session store URL'); }
	if (!sessionDuration) { throw new Error('Missing session duration'); }
	if (!templatesPath) { throw new Error('Missing templates path'); }
	if (!partialsPath) { throw new Error('Missing partials path'); }
	if (!themesPath) { throw new Error('Missing themes path'); }
	if (!faqPath) { throw new Error('Missing FAQ path'); }
	if (!siteTemplatePath) { throw new Error('Missing site template path'); }
	if (!adminAssetsUrl) { throw new Error('Missing admin asset root URL'); }
	if (!themesUrl) { throw new Error('Missing themes URL'); }
	if (!wwwUrl) { throw new Error('Missing www URL'); }
	if (!adaptersConfig) { throw new Error('Missing adapters configuration'); }
	if (!siteAuthOptions) { throw new Error('Missing site authentication options'); }
	if (!uploadAdapterConfig) { throw new Error('Missing upload adapter configuration'); }

	var loginAdapters = loadLoginAdapters('admin', adaptersConfig, database);
	var storageAdapters = loadStorageAdapters(adaptersConfig, database, cache);
	var uploadAdapter = loadUploadAdapter(uploadAdapterConfig);

	var userService = new UserService(database);

	var app = express();
	app.use(session({
		cookieSecret: cookieSecret,
		store: sessionStore,
		ttl: sessionDuration
	}));
	app.use(forms());
	app.use(sessionState());

	initAuth(app, database, {
		adapters: loginAdapters
	});
	initLogin(app, database, {
		templatesPath: templatesPath,
		partialsPath: partialsPath,
		adapters: loginAdapters,
		sessionMiddleware: initAdminSession
	});
	initHome(app, {
		redirect: '/canvases'
	});
	initFaq(app, {
		templatesPath: templatesPath,
		partialsPath: partialsPath,
		faqPath: faqPath,
		sessionMiddleware: initAdminSession
	});
	initSupport(app, {
		templatesPath: templatesPath,
		partialsPath: partialsPath,
		sessionMiddleware: initAdminSession
	});
	initAccount(app, database, {
		templatesPath: templatesPath,
		partialsPath: partialsPath,
		sessionMiddleware: initAdminSession
	});
	initSites(app, database, {
		host: host,
		templatesPath: templatesPath,
		partialsPath: partialsPath,
		themesPath: themesPath,
		siteTemplatePath: siteTemplatePath,
		siteAuthOptions: siteAuthOptions,
		adminAssetsUrl: adminAssetsUrl,
		themesUrl: themesUrl,
		adapters: storageAdapters,
		uploadAdapter: uploadAdapter,
		sessionMiddleware: initAdminSession
	});
	initPreview(app, database, cache, {
		host: host,
		themesPath: themesPath,
		themesUrl: themesUrl,
		adaptersConfig: adaptersConfig
	});
	initTemplates(app, {
		templatesPath: templatesPath,
		partialsPath: partialsPath
	});
	initAdapters(app, database, {
		host: host,
		adapters: storageAdapters,
		sessionMiddleware: initAdminSession
	});
	initErrorHandler(app);
	initViewEngine(app, {
		templatesPath: templatesPath
	});

	return app;


	function initHome(app, options) {
		options = options || {};
		var redirectUrl = options.redirect;

		app.get('/', ensureAuth('/login'), redirect(redirectUrl));
	}

	function initFaq(app, options) {
		options = options || {};
		var templatesPath = options.templatesPath;
		var partialsPath = options.partialsPath;
		var faqPath = options.faqPath;
		var sessionMiddleware = options.sessionMiddleware;

		app.use('/faq', composeMiddleware([
			ensureAuth('/login'),
			faqApp({
				templatesPath: templatesPath,
				partialsPath: partialsPath,
				faqPath: faqPath,
				sessionMiddleware: sessionMiddleware
			})
		]));
	}

	function initSupport(app, options) {
		options = options || {};
		var templatesPath = options.templatesPath;
		var partialsPath = options.partialsPath;
		var sessionMiddleware = options.sessionMiddleware;

		app.use('/support', composeMiddleware([
			ensureAuth('/login'),
			supportApp({
				templatesPath: templatesPath,
				partialsPath: partialsPath,
				sessionMiddleware: sessionMiddleware
			})
		]));
	}

	function initAccount(app, database, options) {
		options = options || {};
		var templatesPath = options.templatesPath;
		var partialsPath = options.partialsPath;
		var sessionMiddleware = options.sessionMiddleware;

		app.use('/account', composeMiddleware([
			ensureAuth('/login'),
			accountApp(database, {
				templatesPath: templatesPath,
				partialsPath: partialsPath,
				sessionMiddleware: sessionMiddleware
			})
		]));
	}

	function initTemplates(app, options) {
		options = options || {};
		var templatesPath = options.templatesPath;
		var partialsPath = options.partialsPath;

		app.use('/templates', templatesApp({
			templatesPath: templatesPath,
			partialsPath: partialsPath
		}));
	}

	function initSites(app, database, options) {
		options = options || {};
		var host = options.host;
		var templatesPath = options.templatesPath;
		var partialsPath = options.partialsPath;
		var themesPath = options.themesPath;
		var siteTemplatePath = options.siteTemplatePath;
		var siteAuthOptions = options.siteAuthOptions;
		var adminAssetsUrl = options.adminAssetsUrl;
		var themesUrl = options.themesUrl;
		var adapters = options.adapters;
		var uploadAdapter = options.uploadAdapter;
		var sessionMiddleware = options.sessionMiddleware;

		app.use('/canvases', composeMiddleware([
			ensureAuth('/login'),
			sitesApp(database, {
				host: host,
				templatesPath: templatesPath,
				partialsPath: partialsPath,
				themesPath: themesPath,
				siteTemplatePath: siteTemplatePath,
				siteAuthOptions: siteAuthOptions,
				adminAssetsUrl: adminAssetsUrl,
				themesUrl: themesUrl,
				adapters: adapters,
				uploadAdapter: uploadAdapter,
				sessionMiddleware: sessionMiddleware
			})
		]));
	}

	function initPreview(app, database, cache, options) {
		options = options || {};
		var host = options.host;
		var themesPath = options.themesPath;
		var themesUrl = options.themesUrl;
		var adaptersConfig = options.adaptersConfig;

		app.use('/preview', composeMiddleware([
			ensureAuth('/login'),
			previewApp(database, cache, {
				host: host,
				themesPath: themesPath,
				themesUrl: themesUrl,
				adaptersConfig: adaptersConfig
			})
		]));
	}

	function initAdapters(app, database, options) {
		options = options || {};
		var host = options.host;
		var adapters = options.adapters;

		app.use('/adapters', composeMiddleware([
			ensureAuth('/login'),
			adaptersApp(database, {
				host: host,
				adapters: adapters
			})
		]));
	}

	function initAuth(app, database, options) {
		options = options || {};
		var adapters = options.adapters;

		app.use('/', adminAuth(database, {
			adapters: adapters,
			login: '/login',
			failure: '/register'
		}));
	}

	function initLogin(app, database, options) {
		options = options || {};
		var templatesPath = options.templatesPath;
		var partialsPath = options.partialsPath;
		var adapters = options.adapters;
		var sessionMiddleware = options.sessionMiddleware;

		app.use('/', loginApp(database, {
			templatesPath: templatesPath,
			partialsPath: partialsPath,
			adapters: adapters,
			sessionMiddleware: sessionMiddleware
		}));
	}

	function initErrorHandler(app) {
		app.use(invalidRoute());
	}

	function initViewEngine(app, options) {
		options = options || {};
		var templatesPath = options.templatesPath;

		app.engine('hbs', handlebarsEngine);
		app.set('views', templatesPath);
		app.set('view engine', 'hbs');
	}

	function ensureAuth(loginUrl) {
		return function(req, res, next) {
			if (req.isAuthenticated()) {
				next();
			} else {
				var redirectUrl = (req.originalUrl === '/' ? null : req.originalUrl);
				var url = (redirectUrl ? appendQueryParams(loginUrl, { redirect: redirectUrl }) : loginUrl);
				res.redirect(url);
			}
		};
	}

	function initAdminSession(req, res, next) {
		loadSessionData(req)
			.then(function(sessionData) {
				Object.keys(sessionData).forEach(function(key) {
					res.locals[key] = sessionData[key];
				});
				next();
			})
			.catch(function(error) {
				next(error);
			});


		function loadSessionData(req) {
			var userModel = req.user || null;
			return Promise.resolve(userModel ? retrieveSortedUserSites(userModel) : null)
				.then(function(sortedSiteModels) {
					var currentSubdomain = (req.subdomains ? req.subdomains.join('.') : null);
					var location = parseLocation(objectAssign({}, host, {
						hostname: (currentSubdomain ? currentSubdomain + '.' : '') + host.hostname,
						path: req.originalUrl
					}));
					var webrootUrl = (userModel ? getSubdomainUrl(userModel.username, { host: host }) : null);
					var domainUrlPattern = getSubdomainUrl('$0', { host: host });
					return {
						location: location,
						urls: {
							root: location.protocol + '//' + location.host,
							webroot: webrootUrl,
							domain: domainUrlPattern,
							home: '/',
							assets: adminAssetsUrl,
							themes: stripTrailingSlash(themesUrl),
							templates: '/templates',
							admin: {
								root: '/',
								faq: '/faq',
								support: '/support',
								account: '/account',
								login: '/login',
								register: '/register',
								logout: '/logout',
								sites: '/canvases',
								sitesCreate: '/canvases/create-canvas',
								sitesCreateThemes: '/canvases/create-canvas/themes',
								preview: '/preview'
							},
							www: {
								root: wwwUrl,
								security: stripTrailingSlash(wwwUrl) + '/security',
								terms: stripTrailingSlash(wwwUrl) + '/terms',
								privacy: stripTrailingSlash(wwwUrl) + '/privacy'
							}
						},
						sites: sortedSiteModels
					};
				});


			function retrieveSortedUserSites(userModel) {
				return userService.retrieveUserSites(userModel.username)
					.then(function(siteModels) {
						var defaultSiteName = userModel.defaultSite;
						return getSortedSiteModels(siteModels, defaultSiteName);
					});


				function getSortedSiteModels(siteModels, defaultSiteName) {
					return siteModels.slice().sort(function(item1, item2) {
						if (item1.name === defaultSiteName) { return -1; }
						if (item2.name === defaultSiteName) { return 1; }
						return (item1.label < item2.label ? -1 : 1);
					});
				}
			}
		}
	}
};
