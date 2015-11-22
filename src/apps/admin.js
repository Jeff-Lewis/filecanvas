'use strict';

var express = require('express');
var composeMiddleware = require('compose-middleware').compose;
var Passport = require('passport').Passport;

var legalApp = require('./admin/legal');
var faqApp = require('./admin/faq');
var supportApp = require('./admin/support');
var accountApp = require('./admin/account');
var previewApp = require('./admin/preview');
var sitesApp = require('./admin/sites');
var adaptersApp = require('./admin/adapters');
var templatesApp = require('./admin/templates');
var loginApp = require('./admin/login');

var transport = require('../middleware/transport');
var redirect = require('../middleware/redirect');
var nestedFormValues = require('../middleware/nestedFormValues');
var sessionState = require('../middleware/sessionState');
var invalidRoute = require('../middleware/invalidRoute');
var errorHandler = require('../middleware/errorHandler');
var handlebarsEngine = require('../engines/handlebars');

var loadAdapters = require('../utils/loadAdapters');
var stripTrailingSlash = require('../utils/stripTrailingSlash');
var serializeQueryParams = require('../utils/serializeQueryParams');

var UrlService = require('../services/UrlService');
var UserService = require('../services/UserService');
var AdminPageService = require('../services/AdminPageService');

module.exports = function(database, options) {
	options = options || {};
	var host = options.host;
	var templatesPath = options.templatesPath;
	var partialsPath = options.partialsPath;
	var errorTemplatesPath = options.errorTemplatesPath;
	var themesPath = options.themesPath;
	var legalTemplatesPath = options.legalTemplatesPath;
	var faqPath = options.faqPath;
	var siteTemplatePath = options.siteTemplatePath;
	var adminAssetsUrl = options.adminAssetsUrl;
	var themeAssetsUrl = options.themeAssetsUrl;
	var themeGalleryUrl = options.themeGalleryUrl;
	var adaptersConfig = options.adapters;
	var siteAuthOptions = options.siteAuth;

	if (!database) { throw new Error('Missing database'); }
	if (!host) { throw new Error('Missing hostname'); }
	if (!templatesPath) { throw new Error('Missing templates path'); }
	if (!partialsPath) { throw new Error('Missing partials path'); }
	if (!errorTemplatesPath) { throw new Error('Missing error templates path'); }
	if (!legalTemplatesPath) { throw new Error('Missing legal templates path'); }
	if (!themesPath) { throw new Error('Missing themes path'); }
	if (!faqPath) { throw new Error('Missing FAQ path'); }
	if (!siteTemplatePath) { throw new Error('Missing site template path'); }
	if (!adminAssetsUrl) { throw new Error('Missing admin asset root URL'); }
	if (!themeAssetsUrl) { throw new Error('Missing theme asset root URL'); }
	if (!themeGalleryUrl) { throw new Error('Missing theme gallery URL'); }
	if (!adaptersConfig) { throw new Error('Missing adapters configuration'); }
	if (!siteAuthOptions) { throw new Error('Missing site authentication options'); }

	var adapters = loadAdapters(adaptersConfig, database);

	var userService = new UserService(database);
	var adminPageService = new AdminPageService({
		templatesPath: templatesPath,
		partialsPath: partialsPath
	});

	var app = express();
	app.use(transport());
	app.use(nestedFormValues());
	app.use(sessionState());
	var passport = new Passport();

	initAuth(app, passport, database, adapters);
	initRoutes(app, database);
	initLogin(app, database, {
		templatesPath: templatesPath,
		partialsPath: partialsPath,
		adapters: adapters,
		sessionMiddleware: initAdminSession
	});
	initHome(app, {
		redirect: '/sites'
	});
	initLegal(app, {
		templatesPath: legalTemplatesPath
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
		themeAssetsUrl: themeAssetsUrl,
		adminAssetsUrl: adminAssetsUrl,
		themeGalleryUrl: themeGalleryUrl,
		adapters: adapters,
		sessionMiddleware: initAdminSession
	});
	initPreview(app, database, {
		host: host,
		errorTemplatesPath: errorTemplatesPath,
		themesPath: themesPath,
		themeAssetsUrl: themeAssetsUrl,
		adaptersConfig: adaptersConfig
	});
	initTemplates(app, {
		templatesPath: templatesPath,
		partialsPath: partialsPath
	});
	initAdapters(app, database, {
		host: host,
		adapters: adapters,
		sessionMiddleware: initAdminSession
	});
	initErrorHandler(app, {
		templatesPath: errorTemplatesPath,
		template: 'error'
	});
	initViewEngine(app, {
		templatesPath: templatesPath
	});

	return app;


	function initHome(app, options) {
		options = options || {};
		var redirectUrl = options.redirect;

		app.get('/', ensureAuth, redirect(redirectUrl));
	}

	function initLegal(app, options) {
		options = options || {};
		var templatesPath = options.templatesPath;

		app.use('/', legalApp({
			templatesPath: templatesPath
		}));
	}

	function initFaq(app, options) {
		options = options || {};
		var templatesPath = options.templatesPath;
		var partialsPath = options.partialsPath;
		var faqPath = options.faqPath;
		var sessionMiddleware = options.sessionMiddleware;

		app.use('/faq', composeMiddleware([
			ensureAuth,
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
			ensureAuth,
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
			ensureAuth,
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
		var themeAssetsUrl = options.themeAssetsUrl;
		var adminAssetsUrl = options.adminAssetsUrl;
		var themeGalleryUrl = options.themeGalleryUrl;
		var adapters = options.adapters;
		var sessionMiddleware = options.sessionMiddleware;

		app.use('/sites', composeMiddleware([
			ensureAuth,
			sitesApp(database, {
				host: host,
				templatesPath: templatesPath,
				partialsPath: partialsPath,
				themesPath: themesPath,
				siteTemplatePath: siteTemplatePath,
				siteAuthOptions: siteAuthOptions,
				themeAssetsUrl: themeAssetsUrl,
				adminAssetsUrl: adminAssetsUrl,
				themeGalleryUrl: themeGalleryUrl,
				adapters: adapters,
				sessionMiddleware: sessionMiddleware
			})
		]));
	}

	function initPreview(app, database, options) {
		options = options || {};
		var host = options.host;
		var errorTemplatesPath = options.errorTemplatesPath;
		var themesPath = options.themesPath;
		var themeAssetsUrl = options.themeAssetsUrl;
		var adaptersConfig = options.adaptersConfig;

		app.use('/preview', composeMiddleware([
			ensureAuth,
			previewApp(database, {
				host: host,
				errorTemplatesPath: errorTemplatesPath,
				themesPath: themesPath,
				themeAssetsUrl: themeAssetsUrl,
				adaptersConfig: adaptersConfig,
				sessionMiddleware: initAdminSession
			})
		]));
	}

	function initAdapters(app, database, options) {
		options = options || {};
		var host = options.host;
		var adapters = options.adapters;
		var sessionMiddleware = options.sessionMiddleware;

		app.use('/adapters', composeMiddleware([
			ensureAuth,
			adaptersApp(database, {
				host: host,
				adapters: adapters,
				sessionMiddleware: sessionMiddleware
			})
		]));
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

	function initAuth(app, passport, database, adapters) {
		app.use(passport.initialize());
		app.use(passport.session());

		initAuthSerializers(passport);
		initAdapterAuthentication(passport, database, adapters);


		function initAuthSerializers(passport) {
			passport.serializeUser(function(userModel, callback) {
				var username = userModel.username;
				return callback && callback(null, username);
			});

			passport.deserializeUser(function(username, callback) {
				return userService.retrieveUser(username)
					.then(function(userModel) {
						return callback(null, userModel);
					})
					.catch(function(error) {
						return callback(error);
					});
			});
		}

		function initAdapterAuthentication(passport, database, adapters) {
			Object.keys(adapters).forEach(function(key) {
				var adapterName = key;
				var adapter = adapters[key];
				app.post('/login/' + adapterName, function(req, res, next) {
					delete req.session.loginRedirect;
					if (req.body.redirect) {
						req.session.loginRedirect = req.body.redirect;
					}
					next();
				});
				var loginMiddleware = adapter.loginMiddleware(passport, { failureRedirect: '/register' }, function(req, res) {
					req.session.adapter = adapterName;
					var redirectUrl = req.session.loginRedirect;
					delete req.session.loginRedirect;
					res.redirect(redirectUrl || '/');
				});
				app.use('/login/' + adapterName, loginMiddleware);
			});
		}
	}

	function initViewEngine(app, options) {
		options = options || {};
		var templatesPath = options.templatesPath;

		app.engine('hbs', handlebarsEngine);
		app.set('views', templatesPath);
		app.set('view engine', 'hbs');
	}

	function initErrorHandler(app, options) {
		options = options || {};
		var template = options.template;
		var templatesPath = options.templatesPath;

		app.use(invalidRoute());
		app.use(errorHandler({
			template: template,
			templatesPath: templatesPath
		}));
	}

	function ensureAuth(req, res, next) {
		if (req.isAuthenticated()) {
			next();
		} else {
			authRedirect(req, res, '/login');
		}
	}

	function authRedirect(req, res, authRoute) {
		var redirectUrl = (req.originalUrl === '/' ? null : req.originalUrl);
		var url = (redirectUrl ? addQueryParams(authRoute, { redirect: redirectUrl }) : authRoute);
		res.redirect(url);


		function addQueryParams(url, params) {
			var queryString = serializeQueryParams(params);
			var urlHasParams = (url.indexOf('?') !== -1);
			return url + (urlHasParams ? '&' : '?') + queryString;
		}
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
			return Promise.resolve(userModel ? userService.retrieveUserSites(userModel.username) : null)
				.then(function(siteModels) {
					if (!siteModels) { return null; }
					var defaultSiteName = userModel.defaultSite;
					return getSortedSiteModels(siteModels, defaultSiteName);
				})
				.then(function(sortedSiteModels) {
					var urlService = new UrlService(req);
					return {
						host: host,
						location: urlService.location,
						urls: {
							root: urlService.location.protocol + '://' + urlService.location.host,
							webroot: (userModel ? urlService.getSubdomainUrl(userModel.username) : null),
							domain: urlService.getSubdomainUrl('$0'),
							admin: '/',
							faq: '/faq',
							support: '/support',
							account: '/account',
							login: '/login',
							register: '/register',
							createLogin: '/create/login',
							logout: '/logout',
							sites: '/sites',
							sitesCreate: '/sites/create-site',
							sitesCreateThemes: '/sites/create-site/themes',
							preview: '/preview',
							terms: '/terms',
							privacy: '/privacy',
							assets: adminAssetsUrl,
							themes: stripTrailingSlash(themeGalleryUrl),
							themeAssets: stripTrailingSlash(themeAssetsUrl)
						},
						sites: sortedSiteModels
					};
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

	function initRoutes(app, database, options) {
		options = options || {};

		initAdminRoutes(app);


		function initAdminRoutes(app) {

			app.get('/create', ensureSignupAuth, initAdminSession, retrieveCreateSignupSiteRoute);
			app.post('/create', ensureSignupAuth, initAdminSession, createSignupSiteRoute);



			function ensureSignupAuth(req, res, next) {
				if (req.isAuthenticated()) {
					next();
				} else {
					authRedirect(req, res, '/create/login');
				}
			}

			function retrieveCreateSignupSiteRoute(req, res, next) {
				var userAdapters = req.user.adapters;
				var theme = req.query.theme || req.body.theme || null;

				new Promise(function(resolve, reject) {
					var adaptersMetadata = Object.keys(userAdapters).filter(function(adapterName) {
						return adapterName !== 'default';
					}).reduce(function(adaptersMetadata, adapterName) {
						var adapter = adapters[adapterName];
						var adapterConfig = userAdapters[adapterName];
						adaptersMetadata[adapterName] = adapter.getMetadata(adapterConfig);
						return adaptersMetadata;
					}, {});
					var defaultAdapterName = userAdapters.default;
					var defaultAdapterPath = adaptersMetadata[defaultAdapterName].path;
					var siteModel = {
						name: '',
						label: '',
						root: {
							adapter: defaultAdapterName,
							path: defaultAdapterPath
						},
						private: false,
						published: false,
						home: false,
						theme: theme
					};
					var templateData = {
						title: 'Create site folder',
						blank: true,
						borderless: true,
						navigation: false,
						footer: false,
						breadcrumb: null,
						content: {
							site: siteModel,
							adapters: adaptersMetadata
						}
					};
					return resolve(
						adminPageService.render(req, res, {
							template: 'create',
							context: templateData
						})
					);
				})
				.catch(function(error) {
					next(error);
				});
			}

			function createSignupSiteRoute(req, res, next) {
				req.params.redirect = '/sites/' + req.body.name + '/create';
				req.url = '/sites';
				next();
			}
		}
	}
};
