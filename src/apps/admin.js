'use strict';

var path = require('path');
var merge = require('lodash.merge');
var isUrl = require('is-url');
var express = require('express');
var composeMiddleware = require('compose-middleware').compose;
var Passport = require('passport').Passport;

var sitesApp = require('./sites');
var legalApp = require('./admin/legal');
var faqApp = require('./admin/faq');
var supportApp = require('./admin/support');
var loginApp = require('./admin/login');

var transport = require('../middleware/transport');
var redirect = require('../middleware/redirect');
var nestedFormValues = require('../middleware/nestedFormValues');
var sessionState = require('../middleware/sessionState');
var invalidRoute = require('../middleware/invalidRoute');
var errorHandler = require('../middleware/errorHandler');
var handlebarsEngine = require('../engines/handlebars');

var loadAdapters = require('../utils/loadAdapters');
var readDirContentsSync = require('../utils/readDirContentsSync');
var stripTrailingSlash = require('../utils/stripTrailingSlash');
var expandConfigPlaceholders = require('../utils/expandConfigPlaceholders');
var serializeQueryParams = require('../utils/serializeQueryParams');
var HttpError = require('../errors/HttpError');

var SiteService = require('../services/SiteService');
var UrlService = require('../services/UrlService');
var UserService = require('../services/UserService');
var AdminPageService = require('../services/AdminPageService');
var ThemeService = require('../services/ThemeService');

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
	var siteTemplateFiles = readDirContentsSync(siteTemplatePath);

	var userService = new UserService(database);
	var siteService = new SiteService(database, {
		host: host,
		adapters: adapters
	});
	var adminPageService = new AdminPageService({
		templatesPath: templatesPath,
		partialsPath: partialsPath
	});
	var themeService = new ThemeService({
		themesPath: themesPath
	});

	var app = express();
	app.use(transport());
	app.use(nestedFormValues());
	app.use(sessionState());
	var passport = new Passport();

	initAuth(app, passport, database, adapters);
	initLogin(app, {
		templatesPath: templatesPath,
		partialsPath: partialsPath,
		adapters: adapters,
		sessionMiddleware: initAdminSession
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
	initRoutes(app, passport, database, {
		themesPath: themesPath,
		errorTemplatesPath: errorTemplatesPath,
		adminAssetsUrl: adminAssetsUrl,
		themeAssetsUrl: themeAssetsUrl,
		themeGalleryUrl: themeGalleryUrl,
		adapters: adapters,
		adaptersConfig: adaptersConfig,
		siteTemplate: siteTemplateFiles,
		siteAuth: siteAuthOptions
	});
	initErrorHandler(app, {
		templatesPath: errorTemplatesPath,
		template: 'error'
	});
	initViewEngine(app, {
		templatesPath: templatesPath
	});

	return app;


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

	function initLogin(app, options) {
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

	function initRoutes(app, passport, database, options) {
		options = options || {};
		var themesPath = options.themesPath;
		var errorTemplatesPath = options.errorTemplatesPath;
		var adminAssetsUrl = options.adminAssetsUrl;
		var themeAssetsUrl = options.themeAssetsUrl;
		var themeGalleryUrl = options.themeGalleryUrl;
		var siteTemplateFiles = options.siteTemplate;
		var siteAuthOptions = options.siteAuth;
		var adapters = options.adapters;
		var adaptersConfig = options.adaptersConfig;

		initAdminRoutes(app, passport, themesPath, errorTemplatesPath, adminAssetsUrl, themeAssetsUrl, themeGalleryUrl, siteTemplateFiles, siteAuthOptions, adapters, adaptersConfig);
		app.use(invalidRoute());


		function initAdminRoutes(app, passport, themesPath, errorTemplatesPath, adminAssetsUrl, themeAssetsUrl, themeGalleryUrl, siteTemplateFiles, siteAuthOptions, adapters, adaptersConfig) {
			app.get('/', ensureAuth, redirect('/sites'));

			app.get('/account', ensureAuth, initAdminSession, retrieveUserAccountRoute);
			app.put('/account', ensureAuth, initAdminSession, updateUserAccountRoute);
			app.delete('/account', ensureAuth, initAdminSession, deleteUserAccountRoute);

			app.get('/sites', ensureAuth, initAdminSession, retrieveSitesRoute);
			app.post('/sites', ensureAuth, initAdminSession, createSiteRoute);
			app.get('/sites/create-site', ensureAuth, initAdminSession, retrieveCreateSiteRoute);
			app.get('/sites/create-site/themes', ensureAuth, initAdminSession, retrieveCreateSiteThemesRoute);
			app.get('/sites/create-site/themes/:theme', ensureAuth, initAdminSession, retrieveCreateSiteThemeRoute);
			app.get('/sites/:site', ensureAuth, initAdminSession, retrieveSiteRoute);
			app.put('/sites/:site', ensureAuth, initAdminSession, updateSiteRoute);
			app.delete('/sites/:site', ensureAuth, initAdminSession, deleteSiteRoute);

			app.get('/sites/:site/users', ensureAuth, initAdminSession, retrieveSiteUsersRoute);
			app.post('/sites/:site/users', ensureAuth, initAdminSession, createSiteUserRoute);
			app.put('/sites/:site/users/:username', ensureAuth, initAdminSession, updateSiteUserRoute);
			app.delete('/sites/:site/users/:username', ensureAuth, initAdminSession, deleteSiteUserRoute);

			app.get('/sites/:site/edit', ensureAuth, initAdminSession, retrieveSiteEditRoute);
			app.get('/sites/:site/create', ensureAuth, initAdminSession, retrieveSignupSiteEditRoute);

			app.get('/create', ensureSignupAuth, initAdminSession, retrieveCreateSignupSiteRoute);
			app.post('/create', ensureSignupAuth, initAdminSession, createSignupSiteRoute);

			app.get('/metadata/:adapter/*', ensureAuth, initAdminSession, retrieveFileMetadataRoute);


			app.use('/templates', createTemplatesApp());

			app.use('/preview', composeMiddleware([
				ensureAuth,
				initAdminSession,
				createPreviewApp(database, {
					host: host,
					templatesPath: themesPath,
					errorTemplatesPath: errorTemplatesPath,
					themesPath: themesPath,
					themeAssetsUrl: themeAssetsUrl,
					adaptersConfig: adaptersConfig
				})
			]));


			function ensureSignupAuth(req, res, next) {
				if (req.isAuthenticated()) {
					next();
				} else {
					authRedirect(req, res, '/create/login');
				}
			}

			function updatePassportUsername(req, userModel, username) {
				return new Promise(function(resolve, reject) {
					userModel.username = username;
					req.login(userModel, function(error) {
						if (error) { return reject(error); }
						resolve();
					});
				});
			}

			function retrieveUserAccountRoute(req, res, next) {
				var userModel = req.user;

				new Promise(function(resolve, reject) {
					var templateData = {
						title: 'Your account',
						navigation: true,
						footer: true,
						breadcrumb: [
							{
								link: '/account',
								icon: 'user',
								label: 'Your account'
							}
						],
						content: {
							user: userModel
						}
					};
					return resolve(
						adminPageService.render(req, res, {
							template: 'account',
							context: templateData
						})
					);
				})
				.catch(function(error) {
					next(error);
				});
			}

			function updateUserAccountRoute(req, res, next) {
				var userModel = req.user;
				var username = userModel.username;
				var updates = {};
				if ('username' in req.body) { updates.username = req.body.username; }
				if ('firstName' in req.body) { updates.firstName = req.body.firstName; }
				if ('lastName' in req.body) { updates.lastName = req.body.lastName; }
				if ('email' in req.body) { updates.email = req.body.email; }
				if ('defaultSite' in req.body) { updates.defaultSite = req.body.defaultSite || null; }

				new Promise(function(resolve, reject) {
					return resolve(
						userService.updateUser(username, updates)
							.then(function() {
								var hasUpdatedUsername = ('username' in updates) && (updates.username !== userModel.username);
								if (!hasUpdatedUsername) { return; }
								return updatePassportUsername(req, userModel, updates.username);
							})
							.then(function(userModel) {
								res.redirect(303, '/account');
							})
					);
				})
				.catch(function(error) {
					next(error);
				});
			}

			function deleteUserAccountRoute(req, res, next) {
				var userModel = req.user;
				var username = userModel.username;
				new Promise(function(resolve, reject) {
					return resolve(
						userService.deleteUser(username)
							.then(function() {
								req.logout();
								req.session.regenerate(function(error) {
									if (error) { return next(error); }
									res.redirect(303, '/');
								});
							})
					);
				})
				.catch(function(error) {
					next(error);
				});
			}

			function retrieveSitesRoute(req, res, next) {
				new Promise(function(resolve, reject) {
					var templateData = {
						title: 'Site dashboard',
						navigation: true,
						footer: true,
						breadcrumb: [
							{
								link: '/sites',
								icon: 'dashboard',
								label: 'Site dashboard'
							}
						],
						content: {
							sites: res.locals.sites,
							themes: themeService.getThemes()
						}
					};
					return resolve(
						adminPageService.render(req, res, {
							template: 'sites',
							context: templateData
						})
					);
				})
				.catch(function(error) {
					next(error);
				});
			}

			function retrieveCreateSiteRoute(req, res, next) {
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
						title: 'Site dashboard',
						navigation: true,
						footer: true,
						breadcrumb: [
							{
								link: '/sites',
								icon: 'dashboard',
								label: 'Site dashboard'
							},
							{
								link: '/sites/create-site',
								icon: 'plus',
								label: 'Create a site'
							}
						],
						content: {
							site: siteModel,
							themes: themeService.getThemes(),
							adapters: adaptersMetadata
						}
					};
					return resolve(
						adminPageService.render(req, res, {
							template: 'sites/create-site',
							context: templateData
						})
					);
				})
				.catch(function(error) {
					next(error);
				});
			}

			function retrieveCreateSiteThemesRoute(req, res, next) {
				var themes = themeService.getThemes();
				var themeIds = Object.keys(themes);
				var firstThemeId = themeIds[0];
				res.redirect('/sites/create-site/themes/' + firstThemeId);
			}

			function retrieveCreateSiteThemeRoute(req, res, next) {
				var themeId = req.params.theme;
				new Promise(function(resolve, reject) {
					var themes = themeService.getThemes();
					var theme = themeService.getTheme(themeId);
					var previousTheme = themeService.getPreviousTheme(themeId);
					var nextTheme = themeService.getNextTheme(themeId);
					var templateData = {
						title: 'Theme gallery',
						fullPage: true,
						navigation: false,
						footer: false,
						breadcrumb: [
							{
								link: '/sites',
								icon: 'dashboard',
								label: 'Site dashboard'
							},
							{
								link: '/sites/create-site',
								icon: 'plus',
								label: 'Create a site'
							},
							{
								link: '/sites/create-site/themes',
								icon: 'image',
								label: 'Theme gallery'
							},
							{
								link: '/sites/create-site/themes/' + theme.id,
								icon: null,
								label: theme.name
							}
						],
						content: {
							themes: themes,
							theme: theme,
							previousTheme: previousTheme,
							nextTheme: nextTheme
						}
					};
					return resolve(
						adminPageService.render(req, res, {
							template: 'sites/create-site/themes/theme',
							context: templateData
						})
					);
				})
				.catch(function(error) {
					next(error);
				});
			}

			function createSiteRoute(req, res, next) {
				var userModel = req.user;
				var username = userModel.username;
				var redirectUrl = req.params.redirect || ('/sites/' + req.body.name);

				var isDefaultSite = (req.body.home === 'true');
				var isPrivate = (req.body.private === 'true');
				var isPublished = (req.body.published === 'true');

				var themeId = req.body.theme && req.body.theme.id || null;
				var themeConfig = req.body.theme && req.body.theme.config || null;
				if (typeof themeConfig === 'string') {
					try {
						themeConfig = JSON.parse(themeConfig);
					} catch(error) {
						return next(new HttpError(401));
					}
				}

				new Promise(function(resolve, reject) {
					var siteModel = {
						'owner': username,
						'name': req.body.name,
						'label': req.body.label,
						'theme': {
							'id': themeId,
							'config': null
						},
						'root': req.body.root || null,
						'private': isPrivate,
						'users': [],
						'published': isPublished,
						'cache': null
					};

					var theme = themeService.getTheme(themeId);
					var defaultThemeConfig = expandConfigPlaceholders(theme.defaults, {
						site: {
							label: siteModel.label
						}
					});
					siteModel.theme.config = merge({}, defaultThemeConfig, themeConfig);

					return resolve(
						siteService.createSite(siteModel, siteTemplateFiles)
							.then(function(siteModel) {
								if (!isDefaultSite) { return siteModel; }
								return userService.updateUserDefaultSiteName(username, siteModel.name)
									.then(function() {
										return siteModel;
									});
							})
							.then(function(siteModel) {
								res.redirect(303, redirectUrl);
							})
					);
				})
				.catch(function(error) {
					next(error);
				});
			}

			function retrieveSiteRoute(req, res, next) {
				var userModel = req.user;
				var username = userModel.username;
				var defaultSiteName = userModel.defaultSite;
				var siteName = req.params.site;
				var userAdapters = req.user.adapters;

				new Promise(function(resolve, reject) {
					var adaptersMetadata = Object.keys(userAdapters).filter(function(adapterName) {
						return adapterName !== 'default';
					}).reduce(function(adaptersMetadata, adapterName) {
						var adapter = adapters[adapterName];
						var adapterConfig = userAdapters[adapterName];
						adaptersMetadata[adapterName] = adapter.getMetadata(adapterConfig);
						return adaptersMetadata;
					}, {});
					var includeTheme = false;
					var includeContents = false;
					var includeUsers = true;
					return resolve(
						siteService.retrieveSite(username, siteName, {
							theme: includeTheme,
							contents: includeContents,
							users: includeUsers
						})
							.then(function(siteModel) {
								var isDefaultSite = (siteModel.name === defaultSiteName);
								siteModel.home = isDefaultSite;
								return siteModel;
							})
							.then(function(siteModel) {
								var templateData = {
									title: 'Site settings: ' + siteModel.label,
									navigation: true,
									footer: true,
									breadcrumb: [
										{
											link: '/sites',
											icon: 'dashboard',
											label: 'Site dashboard'
										},
										{
											link: '/sites/' + siteName,
											icon: 'globe',
											label: siteModel.label
										}
									],
									content: {
										site: siteModel,
										adapters: adaptersMetadata
									}
								};
								return adminPageService.render(req, res, {
									template: 'sites/site',
									context: templateData
								});
							})
					);
				})
				.catch(function(error) {
					next(error);
				});
			}

			function updateSiteRoute(req, res, next) {
				var isPurgeRequest = (req.body._action === 'purge');
				if (isPurgeRequest) {
					return purgeSiteRoute(req, res, next);
				}
				var isPublishSuccess = (req.body._action === 'publish');
				var userModel = req.user;
				var username = userModel.username;
				var defaultSiteName = userModel.defaultSite;
				var siteName = req.params.site;

				var updates = {};
				if (req.body.name) { updates.name = req.body.name; }
				if (req.body.label) { updates.label = req.body.label; }
				if (req.body.theme) { updates.theme = req.body.theme; }
				if (req.body.root) { updates.root = req.body.root || null; }
				if (req.body.private) { updates.private = req.body.private === 'true'; }
				if (req.body.published) { updates.published = req.body.published === 'true'; }

				new Promise(function(resolve, reject) {
					var isDefaultSite = siteName === defaultSiteName;
					var isUpdatedDefaultSite = ('home' in req.body ? req.body.home === 'true' : isDefaultSite);
					var updatedSiteName = ('name' in updates ? updates.name : siteName);
					return resolve(
						siteService.updateSite(username, siteName, updates)
							.then(function() {
								var updatedDefaultSiteName = (isUpdatedDefaultSite ? updatedSiteName : (isDefaultSite ? null : defaultSiteName));
								if (updatedDefaultSiteName === defaultSiteName) { return; }
								return userService.updateUserDefaultSiteName(username, updatedDefaultSiteName);
							})
							.then(function() {
								if (isPublishSuccess) {
									var templateData = {
										title: 'Site published',
										blank: true,
										borderless: true,
										navigation: false,
										footer: false,
										breadcrumb: null,
										content: {
											site: {
												name: updatedSiteName
											}
										}
									};
									return adminPageService.render(req, res, {
										template: 'sites/site/publish-success',
										context: templateData
									});
								} else {
									res.redirect(303, '/sites/' + updatedSiteName);
								}
							})
					);
				})
				.catch(function(error) {
					next(error);
				});
			}

			function purgeSiteRoute(req, res, next) {
				var userModel = req.user;
				var username = userModel.username;
				var siteName = req.params.site;
				var cache = null;

				new Promise(function(resolve, reject) {
					return resolve(
						siteService.updateSiteCache(username, siteName, cache)
							.then(function() {
								res.redirect(303, '/sites/' + siteName);
							})
					);
				})
				.catch(function(error) {
					next(error);
				});
			}

			function deleteSiteRoute(req, res, next) {
				var userModel = req.user;
				var username = userModel.username;
				var siteName = req.params.site;

				new Promise(function(resolve, reject) {
					return resolve(
						siteService.deleteSite(username, siteName)
							.then(function(siteModel) {
								res.redirect(303, '/sites');
							})
					);
				})
				.catch(function(error) {
					next(error);
				});
			}

			function retrieveSiteUsersRoute(req, res, next) {
				var userModel = req.user;
				var username = userModel.username;
				var siteName = req.params.site;
				var includeTheme = false;
				var includeContents = false;
				var includeUsers = true;

				new Promise(function(resolve, reject) {
					return resolve(
						siteService.retrieveSite(username, siteName, {
							theme: includeTheme,
							contents: includeContents,
							users: includeUsers
						})
						.then(function(siteModel) {
							var templateData = {
								title: 'Edit site users: ' + siteModel.label,
								navigation: true,
								footer: true,
								breadcrumb: [
									{
										link: '/sites',
										icon: 'dashboard',
										label: 'Site dashboard'
									},
									{
										link: '/sites/' + siteName,
										icon: 'globe',
										label: siteModel.label
									},
									{
										link: '/sites/' + siteName + '/users',
										icon: 'users',
										label: 'Site users'
									}
								],
								content: {
									site: siteModel
								}
							};
							return adminPageService.render(req, res, {
								template: 'sites/site/users',
								context: templateData
							});
						})
					);
				})
				.catch(function(error) {
					next(error);
				});
			}

			function createSiteUserRoute(req, res, next) {
				var userModel = req.user;
				var username = userModel.username;
				var siteName = req.params.site;
				var siteUserAuthDetails = {
					username: req.body.username,
					password: req.body.password
				};

				new Promise(function(resolve, reject) {
					return resolve(
						siteService.createSiteUser(username, siteName, siteUserAuthDetails, siteAuthOptions)
							.then(function(userModel) {
								res.redirect(303, '/sites/' + siteName + '/users');
							})
					);
				})
				.catch(function(error) {
					next(error);
				});
			}

			function updateSiteUserRoute(req, res, next) {
				var userModel = req.user;
				var username = userModel.username;
				var siteName = req.params.site;
				var siteUsername = req.params.username;
				var siteUserAuthDetails = {
					username: req.params.username,
					password: req.body.password
				};

				new Promise(function(resolve, reject) {
					return resolve(
						siteService.updateSiteUser(username, siteName, siteUsername, siteUserAuthDetails, siteAuthOptions)
							.then(function(userModel) {
								res.redirect(303, '/sites/' + siteName + '/users');
							})
					);
				})
				.catch(function(error) {
					next(error);
				});
			}

			function deleteSiteUserRoute(req, res, next) {
				var userModel = req.user;
				var username = userModel.username;
				var siteName = req.params.site;
				var siteUsername = req.params.username;
				new Promise(function(resolve, reject) {
					return resolve(
						siteService.deleteSiteUser(username, siteName, siteUsername)
							.then(function() {
								res.redirect(303, '/sites/' + siteName + '/users');
							})
					);
				})
				.catch(function(error) {
					next(error);
				});
			}

			function retrieveSiteEditRoute(req, res, next) {
				var isSignupSite = Boolean(req.params.create);
				var userModel = req.user;
				var username = userModel.username;
				var userAdapters = req.user.adapters;
				var siteName = req.params.site;
				var includeTheme = true;
				var includeContents = false;
				var includeUsers = false;

				new Promise(function(resolve, reject) {
					return resolve(
						siteService.retrieveSite(username, siteName, {
							theme: includeTheme,
							contents: includeContents,
							users: includeUsers
						})
						.then(function(siteModel) {
							var siteAdapter = siteModel.root.adapter;
							var sitePath = siteModel.root.path;
							var adapterOptions = userAdapters[siteAdapter];
							var adapter = adapters[siteAdapter];
							var adapterConfig = adapter.getUploadConfig(sitePath, adapterOptions);
							var themeId = siteModel.theme.id;
							var theme = themeService.getTheme(themeId);
							var themeAssetsRoot = themeAssetsUrl + themeId + '/';
							var templateData = {
								title: 'Site editor',
								stylesheets: [
									'//cdnjs.cloudflare.com/ajax/libs/bootstrap-select/1.7.5/css/bootstrap-select.min.css',
									adminAssetsUrl + 'css/bootstrap-colorpicker.min.css',
									adminAssetsUrl + 'css/shunt-editor.css'
								],
								scripts: [
									'//cdnjs.cloudflare.com/ajax/libs/bootstrap-select/1.7.5/js/bootstrap-select.min.js',
									adminAssetsUrl + 'js/bootstrap-colorpicker.min.js',
									adminAssetsUrl + 'js/shunt-editor.js',
									'/templates/theme-options.js',
									themeGalleryUrl + themeId + '/template/index.js'
								],
								fullPage: true,
								navigation: false,
								footer: false,
								breadcrumb: [
									{
										link: '/sites',
										icon: 'dashboard',
										label: 'Site dashboard'
									},
									{
										link: '/sites/' + siteName,
										icon: 'globe',
										label: siteModel.label
									},
									{
										link: '/sites/' + siteName + '/theme',
										icon: 'paint-brush',
										label: 'Site editor'
									}
								],
								content: {
									signup: isSignupSite,
									site: siteModel,
									themes: themeService.getThemes(),
									adapter: adapterConfig
								}
							};
							if (theme.fonts) {
								var fontsStylesheetUrl = isUrl(theme.fonts) ? theme.fonts : themeAssetsRoot + theme.fonts;
								templateData.stylesheets.push(fontsStylesheetUrl);
							}
							return adminPageService.render(req, res, {
								template: 'sites/site/edit',
								context: templateData
							});
						})
					);
				})
				.catch(function(error) {
					next(error);
				});
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
				createSiteRoute(req, res, next);
			}

			function retrieveSignupSiteEditRoute(req, res, next) {
				req.params.create = true;
				retrieveSiteEditRoute(req, res, next);
			}

			function retrieveFileMetadataRoute(req, res, next) {
				var userModel = req.user;
				var username = userModel.username;
				var adapter = req.params.adapter;
				var filePath = req.params[0];

				new Promise(function(resolve, reject) {
					return resolve(
						siteService.retrieveFileMetadata(username, adapter, filePath)
							.then(function(metadata) {
								res.json(metadata);
							})
							.catch(function(error) {
								if (error.status === 404) {
									res.json(null);
								} else {
									throw error;
								}
							})
					);
				})
				.catch(function(error) {
					next(error);
				});
			}

			function createPreviewApp(database, options) {
				options = options || {};
				var host = options.host;
				var templatesPath = options.templatesPath;
				var errorTemplatesPath = options.errorTemplatesPath;
				var themesPath = options.themesPath;
				var themeAssetsUrl = options.themeAssetsUrl;
				var adaptersConfig = options.adaptersConfig;

				var app = express();
				app.use(addUsernamePathPrefix);
				app.use(sitesApp(database, {
					preview: true,
					host: host,
					templatesPath: templatesPath,
					errorTemplatesPath: errorTemplatesPath,
					themesPath: themesPath,
					themeAssetsUrl: themeAssetsUrl,
					adapters: adaptersConfig
				}));
				return app;


				function addUsernamePathPrefix(req, res, next) {
					req.url = '/' + req.user.username + req.url;
					next();
				}
			}

			function createTemplatesApp() {
				var app = express();

				app.get('/theme-options.js', retrieveThemeOptionsTemplateRoute);

				return app;


				function retrieveThemeOptionsTemplateRoute(req, res, next) {
					new Promise(function(resolve, reject) {
						var templatePath = path.join(templatesPath, '../_partials/theme-options.hbs');
						var templateName = 'theme-options';
						var templateOptions = {};
						resolve(
							handlebarsEngine.serialize(templatePath, templateName, templateOptions)
								.then(function(serializedTemplate) {
									sendPrecompiledTemplate(res, serializedTemplate);
								})
						);
					})
					.catch(function(error) {
						return next(error);
					});
				}


				function sendPrecompiledTemplate(res, template) {
					res.set('Content-Type', 'text/javscript');
					res.send(template);
				}
			}
		}
	}
};
