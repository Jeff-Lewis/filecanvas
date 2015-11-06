'use strict';

var fs = require('fs');
var path = require('path');
var objectAssign = require('object-assign');
var merge = require('lodash.merge');
var express = require('express');
var composeMiddleware = require('compose-middleware').compose;
var Passport = require('passport').Passport;

var sitesApp = require('./sites');

var transport = require('../middleware/transport');
var nestedFormValues = require('../middleware/nestedFormValues');
var sessionState = require('../middleware/sessionState');
var invalidRoute = require('../middleware/invalidRoute');
var errorHandler = require('../middleware/errorHandler');
var handlebarsEngine = require('../engines/handlebars');

var loadThemes = require('../utils/loadThemes');
var loadAdapters = require('../utils/loadAdapters');
var readDirContentsSync = require('../utils/readDirContentsSync');
var expandConfigPlaceholders = require('../utils/expandConfigPlaceholders');
var HttpError = require('../errors/HttpError');

var SiteService = require('../services/SiteService');
var UrlService = require('../services/UrlService');
var UserService = require('../services/UserService');
var RegistrationService = require('../services/RegistrationService');

module.exports = function(database, options) {
	options = options || {};
	var host = options.host;
	var templatesPath = options.templatesPath;
	var errorTemplatesPath = options.errorTemplatesPath;
	var themesPath = options.themesPath;
	var termsPath = options.termsPath;
	var privacyPath = options.privacyPath;
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
	if (!errorTemplatesPath) { throw new Error('Missing error templates path'); }
	if (!themesPath) { throw new Error('Missing themes path'); }
	if (!termsPath) { throw new Error('Missing terms and conditions path'); }
	if (!privacyPath) { throw new Error('Missing privacy policy path'); }
	if (!faqPath) { throw new Error('Missing FAQ path'); }
	if (!siteTemplatePath) { throw new Error('Missing site template path'); }
	if (!adminAssetsUrl) { throw new Error('Missing admin asset root URL'); }
	if (!themeAssetsUrl) { throw new Error('Missing theme asset root URL'); }
	if (!themeGalleryUrl) { throw new Error('Missing theme gallery URL'); }
	if (!adaptersConfig) { throw new Error('Missing adapters configuration'); }
	if (!siteAuthOptions) { throw new Error('Missing site authentication options'); }

	var themes = loadThemes(themesPath);
	var adapters = loadAdapters(adaptersConfig, database);
	var siteTemplateFiles = readDirContentsSync(siteTemplatePath);

	var userService = new UserService(database);
	var siteService = new SiteService(database, {
		host: host,
		adapters: adapters
	});

	var app = express();
	app.use(transport());
	app.use(nestedFormValues());
	app.use(sessionState());
	var passport = new Passport();

	initAuth(app, passport, database, adapters);
	initStaticPages(app, {
		'/terms': fs.readFileSync(termsPath, { encoding: 'utf8' }),
		'/privacy': fs.readFileSync(privacyPath, { encoding: 'utf8' })
	});
	initRoutes(app, passport, database, {
		themes: themes,
		themesPath: themesPath,
		errorTemplatesPath: errorTemplatesPath,
		adminAssetsUrl: adminAssetsUrl,
		themeAssetsUrl: themeAssetsUrl,
		themeGalleryUrl: themeGalleryUrl,
		faqData: JSON.parse(fs.readFileSync(faqPath, { encoding: 'utf8' })),
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


	function initStaticPages(app, pages) {
		Object.keys(pages).forEach(function(path) {
			var file = pages[path];
			app.get(path, function(req, res) {
				res.send(file);
			});
		});
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
				var loginCallback = createLoginCallback(adapterName);
				var loginMiddleware = adapter.loginMiddleware(passport, { failureRedirect: '/register' }, loginCallback);
				app.use('/login/' + adapterName, loginMiddleware);
			});


			function createLoginCallback(adapterName) {
				return function(req, res) {
					req.session.adapter = adapterName;
					if (req.session.loginRedirect) {
						var redirectUrl = req.session.loginRedirect;
						delete req.session.loginRedirect;
						res.redirect(redirectUrl);
					} else {
						res.redirect('/');
					}
				};
			}
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

	function initRoutes(app, passport, database, options) {
		options = options || {};
		var themes = options.themes;
		var themesPath = options.themesPath;
		var errorTemplatesPath = options.errorTemplatesPath;
		var adminAssetsUrl = options.adminAssetsUrl;
		var themeAssetsUrl = options.themeAssetsUrl;
		var themeGalleryUrl = options.themeGalleryUrl;
		var faqData = options.faqData;
		var siteTemplateFiles = options.siteTemplate;
		var siteAuthOptions = options.siteAuth;
		var adapters = options.adapters;
		var adaptersConfig = options.adaptersConfig;

		initPublicRoutes(app, passport, adapters);
		initPrivateRoutes(app, passport, themes, themesPath, errorTemplatesPath, adminAssetsUrl, themeAssetsUrl, themeGalleryUrl, faqData, siteTemplateFiles, siteAuthOptions, adapters, adaptersConfig);
		app.use(invalidRoute());


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
							urls: getAdminUrls(urlService, userModel, adapters),
							location: urlService.location,
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

				function getAdminUrls(urlService, userModel, adapters) {
					return {
						webroot: (userModel ? urlService.getSubdomainUrl(userModel.username) : null),
						domain: urlService.getSubdomainUrl('$0'),
						admin: '/',
						faq: '/faq',
						support: '/support',
						account: '/account',
						login: '/login',
						register: '/register',
						logout: '/logout',
						sites: '/sites',
						sitesCreate: '/sites/create-site',
						sitesCreateThemes: '/sites/create-site/themes',
						preview: '/preview',
						terms: '/terms',
						privacy: '/privacy',
						assets: adminAssetsUrl,
						themes: stripTrailingSlash(themeGalleryUrl)
					};


					function stripTrailingSlash(string) {
						var REGEXP_TRAILING_SLASH = /\/+$/;
						return string.replace(REGEXP_TRAILING_SLASH, '');
					}
				}
			}
		}

		function renderAdminPage(req, res, templateName, context) {
			return new Promise(function(resolve, reject) {
				var templateData = getTemplateData(req, res, context);
				renderTemplate(req, res, {
					template: templateName,
					context: templateData
				}, function(error, pageContent) {
					if (error) { return reject(error); }
					var templateOptions = {
						partials: {
							'page': pageContent
						}
					};
					var templateData = getTemplateData(req, res, context, templateOptions);
					delete req.session.state;
					renderTemplate(req, res, {
						template: 'index',
						context: templateData
					}, function(error, data) {
						if (error) { return reject(error); }
						res.send(data);
						resolve(data);
					});
				});
			});


			function renderTemplate(req, res, options, callback) {
				options = options || {};
				var template = options.template;
				var context = options.context;
				var extension = path.extname(req.url) || '.hbs';
				res.render(template + extension, context, callback);
			}

			function getTemplateData(req, res, context, templateOptions) {
				templateOptions = templateOptions || null;
				var templateData = {
					_: templateOptions,
					session: getTemplateSessionData(req, res)
				};
				return objectAssign({}, context, templateData);
			}

			function getTemplateSessionData(req, res) {
				var session = {
					state: req.session.state,
					user: req.user || null
				};
				return objectAssign({}, res.locals, session);
			}
		}

		function initPublicRoutes(app, passport, adapters) {
			app.get('/login', redirectIfLoggedIn, initAdminSession, retrieveLoginRoute);
			app.get('/register', redirectIfLoggedIn, redirectIfNoPendingUser, initAdminSession, retrieveRegisterRoute);
			app.post('/register', redirectIfLoggedIn, redirectIfNoPendingUser, initAdminSession, processRegisterRoute);


			function redirectIfLoggedIn(req, res, next) {
				if (req.isAuthenticated()) {
					return res.redirect('/');
				}
				next();
			}

			function redirectIfNoPendingUser(req, res, next) {
				var registrationService = new RegistrationService(req);
				var hasPendingUser = registrationService.hasPendingUser();
				if (!hasPendingUser) {
					return res.redirect('/');
				}
				return next();
			}

			function retrieveLoginRoute(req, res, next) {
				var adaptersHash = Object.keys(adapters).reduce(function(adaptersHash, key) {
					adaptersHash[key] = true;
					return adaptersHash;
				}, {});
				var templateData = {
					title: 'Login',
					navigation: false,
					footer: true,
					content: {
						adapters: adaptersHash
					}
				};
				renderAdminPage(req, res, 'login', templateData)
					.catch(function(error) {
						next(error);
					});
			}

			function retrieveRegisterRoute(req, res, next) {
				var registrationService = new RegistrationService(req);
				var pendingUser = registrationService.getPendingUser();
				var userDetails = pendingUser.user;
				var username = userDetails.username;
				userService.generateUsername(username)
					.then(function(username) {
						userDetails = objectAssign(userDetails, {
							username: username
						});
						var templateData = {
							title: 'Your profile',
							navigation: false,
							header: {
								title: 'Create account'
							},
							footer: true,
							content: {
								user: pendingUser.user
							}
						};
						renderAdminPage(req, res, 'register', templateData)
							.catch(function(error) {
								next(error);
							});
					});
			}

			function processRegisterRoute(req, res, next) {
				var registrationService = new RegistrationService(req);
				var pendingUser = registrationService.getPendingUser();
				var adapter = pendingUser.adapter;
				var adapterConfig = pendingUser.adapterConfig;
				var userDetails = {
					username: req.body.username,
					firstName: req.body.firstName,
					lastName: req.body.lastName,
					email: req.body.email
				};
				userService.createUser(userDetails, adapter, adapterConfig)
					.then(function(userModel) {
						registrationService.clearPendingUser();
						req.login(userModel, function(error) {
							if (error) { return next(error); }
							res.redirect('/');
						});
					})
					.catch(function(error) {
						next(error);
					});
			}
		}

		function initPrivateRoutes(app, passport, themes, themesPath, errorTemplatesPath, adminAssetsUrl, themeAssetsUrl, themeGalleryUrl, faqData, siteTemplateFiles, siteAuthOptions, adapters, adaptersConfig) {
			app.get('/', ensureAuth, initAdminSession, retrieveHomeRoute);

			app.get('/faq', ensureAuth, initAdminSession, retrieveFaqRoute);
			app.get('/support', ensureAuth, initAdminSession, retrieveSupportRoute);

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

			app.get('/metadata/:adapter/*', ensureAuth, initAdminSession, retrieveFileMetadataRoute);

			app.get('/logout', redirectIfLoggedOut, initAdminSession, retrieveLogoutRoute);

			app.use('/preview', composeMiddleware([
				ensureAuth,
				initAdminSession,
				createPreviewApp(database, {
					host: host,
					templatesPath: themesPath,
					errorTemplatesPath: errorTemplatesPath,
					themeAssetsUrl: themeAssetsUrl,
					adaptersConfig: adaptersConfig
				})
			]));


			function ensureAuth(req, res, next) {
				if (!req.isAuthenticated()) {
					var redirectUrl = (req.originalUrl === '/' ? null : req.originalUrl);
					if (redirectUrl) { req.session.loginRedirect = redirectUrl; }
					res.redirect('/login');
					return;
				}
				next();
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

			function redirectIfLoggedOut(req, res, next) {
				if (req.isAuthenticated()) {
					return next();
				}
				res.redirect('/');
			}

			function retrieveHomeRoute(req, res, next) {
				res.redirect('/sites');
			}

			function retrieveFaqRoute(req, res, next) {
				var username = req.user.username;
				var siteModels = res.locals.sites;
				var siteName = (siteModels.length > 0 ? siteModels[Math.floor(Math.random() * siteModels.length)].name : 'my-site');
				var faqs = replaceFaqPlaceholders(faqData, {
					username: username,
					sitename: siteName
				});
				var templateData = {
					title: 'FAQ',
					navigation: true,
					footer: true,
					breadcrumb: [
						{
							link: '/faq',
							icon: 'info-circle',
							label: 'FAQ'
						}
					],
					content: {
						questions: faqs
					}
				};
				renderAdminPage(req, res, 'faq', templateData)
					.catch(function(error) {
						next(error);
					});


				function replaceFaqPlaceholders(faqData, options) {
					var username = options.username;
					var sitename = options.sitename;
					return JSON.parse(JSON.stringify(faqData)
						.replace(/\$\{username\}/g, username)
						.replace(/\$\{sitename\}/g, sitename)
					);
				}
			}

			function retrieveSupportRoute(req, res, next) {
				var templateData = {
					title: 'Support',
					navigation: true,
					footer: true,
					breadcrumb: [
						{
							link: '/support',
							icon: 'question-circle',
							label: 'Support'
						}
					],
					content: null
				};
				renderAdminPage(req, res, 'support', templateData)
					.catch(function(error) {
						next(error);
					});
			}

			function retrieveUserAccountRoute(req, res, next) {
				var userModel = req.user;
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
				return renderAdminPage(req, res, 'account', templateData);
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
				userService.updateUser(username, updates)
					.then(function() {
						var hasUpdatedUsername = ('username' in updates) && (updates.username !== userModel.username);
						if (!hasUpdatedUsername) { return; }
						return updatePassportUsername(req, userModel, updates.username);
					})
					.then(function(userModel) {
						res.redirect(303, '/account');
					})
					.catch(function(error) {
						next(error);
					});
			}

			function deleteUserAccountRoute(req, res, next) {
				var userModel = req.user;
				var username = userModel.username;
				userService.deleteUser(username)
					.then(function() {
						req.logout();
						req.session.regenerate(function(error) {
							if (error) { return next(error); }
							res.redirect(303, '/');
						});
					})
					.catch(function(error) {
						next(error);
					});
			}

			function retrieveSitesRoute(req, res, next) {
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
						themes: themes
					}
				};
				renderAdminPage(req, res, 'sites', templateData)
					.catch(function(error) {
						next(error);
					});
			}

			function retrieveCreateSiteRoute(req, res, next) {
				var userAdapters = req.user.adapters;
				var theme = req.body.theme || null;
				if (theme && theme.config) {
					try {
						theme.config = JSON.parse(theme.config);
					} catch (error) {
						return next(new HttpError(400, 'Invalid theme configuration: ' + theme.config));
					}
				}
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
						themes: themes,
						adapters: adaptersMetadata
					}
				};
				renderAdminPage(req, res, 'sites/create-site', templateData)
					.catch(function(error) {
						next(error);
					});
			}

			function retrieveCreateSiteThemesRoute(req, res, next) {
				var themeIds = Object.keys(themes);
				var firstThemeId = themeIds[0];
				res.redirect('/sites/create-site/themes/' + firstThemeId);
			}

			function retrieveCreateSiteThemeRoute(req, res, next) {
				var themeId = req.params.theme;
				if (!(themeId in themes)) {
					return next(new HttpError(404));
				}
				var theme = themes[themeId];
				var previousTheme = getPreviousTheme(themes, themeId);
				var nextTheme = getNextTheme(themes, themeId);
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
						theme: theme,
						previous: previousTheme,
						next: nextTheme
					}
				};
				renderAdminPage(req, res, 'sites/create-site/themes/theme', templateData)
					.catch(function(error) {
						next(error);
					});


				function getPreviousTheme(themes, themeId) {
					var themeIds = Object.keys(themes);
					var themeIndex = themeIds.indexOf(themeId);
					var previousThemeIndex = (themeIndex <= 0 ? themeIds.length - 1 : themeIndex - 1);
					var previousThemeId = themeIds[previousThemeIndex];
					var previousTheme = themes[previousThemeId];
					return previousTheme;
				}

				function getNextTheme(themes, themeId) {
					var themeIds = Object.keys(themes);
					var themeIndex = themeIds.indexOf(themeId);
					var nextThemeIndex = (themeIndex >= themeIds.length - 1 ? 0 : themeIndex + 1);
					var nextThemeId = themeIds[nextThemeIndex];
					var nextTheme = themes[nextThemeId];
					return nextTheme;
				}
			}

			function createSiteRoute(req, res, next) {
				var userModel = req.user;
				var username = userModel.username;

				var isDefaultSite = (req.body.home === 'true');
				var isPrivate = (req.body.private === 'true');
				var isPublished = (req.body.published === 'true');

				var themeId = req.body.theme && req.body.theme.id || null;
				var themeConfig = req.body.theme && req.body.theme.config || null;

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

				var theme = themes[themeId];
				var defaultThemeConfig = expandConfigPlaceholders(theme.defaults, {
					site: siteModel,
					user: req.user
				});
				siteModel.theme.config = merge({}, defaultThemeConfig, themeConfig);


				siteService.createSite(siteModel, siteTemplateFiles)
					.then(function(siteModel) {
						if (!isDefaultSite) { return siteModel; }
						return userService.updateUserDefaultSiteName(username, siteModel.name)
							.then(function() {
								return siteModel;
							});
					})
					.then(function(siteModel) {
						res.redirect(303, '/sites/' + siteModel.name);
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
						return renderAdminPage(req, res, 'sites/site', templateData);
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
				var userModel = req.user;
				var username = userModel.username;
				var defaultSiteName = userModel.defaultSite;
				var siteName = req.params.site;

				var updates = {
					'owner': username
				};
				if (req.body.name) { updates.name = req.body.name; }
				if (req.body.label) { updates.label = req.body.label; }
				if (req.body.theme) { updates.theme = req.body.theme; }
				if (req.body.root) { updates.root = req.body.root || null; }
				if (req.body.private) { updates.private = req.body.private === 'true'; }
				if (req.body.published) { updates.published = req.body.published === 'true'; }

				var isDefaultSite = siteName === defaultSiteName;
				var isUpdatedDefaultSite = ('home' in req.body ? req.body.home === 'true' : isDefaultSite);
				var updatedSiteName = ('name' in updates ? updates.name : siteName);
				siteService.updateSite(username, siteName, updates)
					.then(function() {
						var updatedDefaultSiteName = (isUpdatedDefaultSite ? updatedSiteName : (isDefaultSite ? null : defaultSiteName));
						if (updatedDefaultSiteName === defaultSiteName) { return; }
						return userService.updateUserDefaultSiteName(username, updatedDefaultSiteName);
					})
					.then(function() {
						res.redirect(303, '/sites/' + updatedSiteName);
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
				siteService.updateSiteCache(username, siteName, cache)
					.then(function() {
						res.redirect(303, '/sites/' + siteName);
					})
					.catch(function(error) {
						next(error);
					});
			}

			function deleteSiteRoute(req, res, next) {
				var userModel = req.user;
				var username = userModel.username;
				var siteName = req.params.site;
				siteService.deleteSite(username, siteName)
					.then(function(siteModel) {
						res.redirect(303, '/sites');
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
						return renderAdminPage(req, res, 'sites/site/users', templateData);
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
				siteService.createSiteUser(username, siteName, siteUserAuthDetails, siteAuthOptions)
					.then(function(userModel) {
						res.redirect(303, '/sites/' + siteName + '/users');
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
				siteService.updateSiteUser(username, siteName, siteUsername, siteUserAuthDetails, siteAuthOptions)
					.then(function(userModel) {
						res.redirect(303, '/sites/' + siteName + '/users');
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
				siteService.deleteSiteUser(username, siteName, siteUsername)
					.then(function() {
						res.redirect(303, '/sites/' + siteName + '/users');
					})
					.catch(function(error) {
						next(error);
					});
			}

			function retrieveSiteEditRoute(req, res, next) {
				var userModel = req.user;
				var username = userModel.username;
				var userAdapters = req.user.adapters;
				var siteName = req.params.site;
				var includeTheme = true;
				var includeContents = false;
				var includeUsers = false;
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
						var templateData = {
							title: 'Site editor',
							stylesheets: [
								adminAssetsUrl + 'css/bootstrap-colorpicker.min.css',
								adminAssetsUrl + 'css/shunt-editor.css'
							],
							scripts: [
								adminAssetsUrl + 'js/bootstrap-colorpicker.min.js',
								adminAssetsUrl + 'js/shunt-editor.js',
								themeGalleryUrl + siteModel.theme.id + '/template/index.js'
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
									label: 'Theme editor'
								}
							],
							content: {
								site: siteModel,
								themes: themes,
								adapter: adapterConfig
							}
						};
						return renderAdminPage(req, res, 'sites/site/edit', templateData);
					})
					.catch(function(error) {
						next(error);
					});
			}

			function retrieveFileMetadataRoute(req, res, next) {
				var userModel = req.user;
				var username = userModel.username;
				var adapter = req.params.adapter;
				var filePath = req.params[0];
				siteService.retrieveFileMetadata(username, adapter, filePath)
					.then(function(metadata) {
						res.json(metadata);
					})
					.catch(function(error) {
						if (error.status === 404) {
							res.json(null);
							return;
						}
						next(error);
					});
			}

			function retrieveLogoutRoute(req, res, next) {
				var adapterName = req.session.adapter;
				req.logout();
				req.session.regenerate(function(error) {
					if (error) { return next(error); }
					if (!adapterName || (adapterName === 'local')) {
						return res.redirect('/');
					}
					var templateData = {
						title: 'Logout',
						navigation: true,
						footer: true,
						content: {
							adapter: adapterName
						}
					};
					renderAdminPage(req, res, 'logout', templateData)
						.catch(function(error) {
							next(error);
						});
				});
			}

			function createPreviewApp(database, options) {
				options = options || {};
				var host = options.host;
				var templatesPath = options.templatesPath;
				var errorTemplatesPath = options.errorTemplatesPath;
				var themeAssetsUrl = options.themeAssetsUrl;
				var adaptersConfig = options.adaptersConfig;

				var app = express();
				app.use(addUsernamePathPrefix);
				app.use(sitesApp(database, {
					preview: true,
					host: host,
					templatesPath: templatesPath,
					errorTemplatesPath: errorTemplatesPath,
					themeAssetsUrl: themeAssetsUrl,
					adapters: adaptersConfig
				}));
				return app;


				function addUsernamePathPrefix(req, res, next) {
					req.url = '/' + req.user.username + req.url;
					next();
				}
			}
		}
	}
};
