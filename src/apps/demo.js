'use strict';

var merge = require('lodash.merge');
var express = require('express');

var previewApp = require('./demo/preview');

var transport = require('../middleware/transport');
var nestedFormValues = require('../middleware/nestedFormValues');
var sessionState = require('../middleware/sessionState');
var redirect = require('../middleware/redirect');
var invalidRoute = require('../middleware/invalidRoute');
var errorHandler = require('../middleware/errorHandler');

var adminAuth = require('../apps/admin/middleware/adminAuth');

var loadAdapters = require('../utils/loadAdapters');
var stripTrailingSlash = require('../utils/stripTrailingSlash');
var expandConfigPlaceholders = require('../utils/expandConfigPlaceholders');

var handlebarsEngine = require('../engines/handlebars');

var UserService = require('../services/UserService');
var SiteService = require('../services/SiteService');
var ThemeService = require('../services/ThemeService');
var UrlService = require('../services/UrlService');
var AdminPageService = require('../services/AdminPageService');

var HttpError = require('../errors/HttpError');

module.exports = function(database, options) {
	var host = options.host;
	var templatesPath = options.templatesPath;
	var partialsPath = options.partialsPath;
	var errorTemplatesPath = options.errorTemplatesPath;
	var themesPath = options.themesPath;
	var themeAssetsUrl = options.themeAssetsUrl;
	var adminUrl = options.adminUrl;
	var adminAssetsUrl = options.adminAssetsUrl;
	var adminTemplatesUrl = options.adminTemplatesUrl;
	var themesUrl = options.themesUrl;
	var adaptersConfig = options.adapters;

	if (!database) { throw new Error('Missing database'); }
	if (!host) { throw new Error('Missing host name'); }
	if (!templatesPath) { throw new Error('Missing templates path'); }
	if (!partialsPath) { throw new Error('Missing partials path'); }
	if (!errorTemplatesPath) { throw new Error('Missing error templates path'); }
	if (!themesPath) { throw new Error('Missing themes path'); }
	if (!themeAssetsUrl) { throw new Error('Missing theme asset root URL'); }
	if (!adminUrl) { throw new Error('Missing admin URL'); }
	if (!adminAssetsUrl) { throw new Error('Missing admin asset root URL'); }
	if (!adminTemplatesUrl) { throw new Error('Missing admin templates URL'); }
	if (!themesUrl) { throw new Error('Missing themes URL'); }
	if (!adaptersConfig) { throw new Error('Missing adapters configuration'); }

	if (adaptersConfig.dropbox) {
		adaptersConfig = merge({}, adaptersConfig, {
			dropbox: {
				loginCallbackUrl: adaptersConfig.dropbox.demoLoginCallbackUrl
			}
		});
	}
	var adapters = loadAdapters(adaptersConfig, database);

	var userService = new UserService(database);
	var siteService = new SiteService(database, {
		host: host,
		adapters: adapters
	});
	var themeService = new ThemeService({
		themesPath: themesPath
	});
	var adminPageService = new AdminPageService({
		templatesPath: templatesPath,
		partialsPath: partialsPath
	});

	var app = express();
	app.use(transport());
	app.use(nestedFormValues());
	app.use(sessionState());

	initAuth(app, database, {
		adapters: adapters
	});
	initRoutes(app);
	initSitePreview(app, {
		adapters: adapters
	});
	initErrorHandler(app, {
		templatesPath: errorTemplatesPath,
		template: 'error'
	});
	initViewEngine(app, {
		templatesPath: templatesPath
	});

	return app;


	function initAuth(app, database, options) {
		options = options || {};
		var adapters = options.adapters;

		app.use('/', adminAuth(database, {
			adapters: adapters,
			login: '/login',
			failure: '/register'
		}));
	}

	function initErrorHandler(app, options) {
		options = options || {};
		var template = options.template;
		var templatesPath = options.templatesPath;

		app.use(invalidRoute());
		app.use(errorHandler({
			templatesPath: templatesPath,
			template: template
		}));
	}

	function initViewEngine(app, options) {
		options = options || {};
		var templatesPath = options.templatesPath;

		app.engine('hbs', handlebarsEngine);

		app.set('views', templatesPath);
		app.set('view engine', 'hbs');
	}

	function initSitePreview(app, options) {
		options = options || {};
		var adapters = options.adapters;

		app.use('/editor/preview', previewApp({
			adapters: adapters
		}));
	}

	function initRoutes(app) {
		app.get('/', redirect('/themes'));
		app.get('/themes', retrieveThemesRoute);
		app.get('/themes/:theme', initAdminSession, retrieveThemeRoute);
		app.get('/editor', initAdminSession, retrieveThemeEditorRoute);
		app.post('/login', initAdminSession, createThemeEditorLoginRoute);
		app.post('/editor/add-files', ensureAuth('/editor'), initAdminSession, createSiteFolderRoute);
		app.post('/editor/publish', ensureAuth('/editor'), initAdminSession, createSiteRoute);


		function ensureAuth(loginUrl) {
			return function(req, res, next) {
				if (req.isAuthenticated()) {
					next();
				} else {
					res.redirect(loginUrl);
				}
			};
		}

		function initAdminSession(req, res, next) {
			var sessionData = getSessionData(req);
			Object.keys(sessionData).forEach(function(key) {
				res.locals[key] = sessionData[key];
			});
			next();


			function getSessionData(req) {
				var userModel = req.user || null;
				var urlService = new UrlService(req);
				return {
					location: urlService.location,
					urls: {
						root: urlService.location.protocol + '//' + urlService.location.host,
						webroot: (userModel ? urlService.getSubdomainUrl(userModel.username) : null),
						domain: urlService.getSubdomainUrl('$0'),
						assets: adminAssetsUrl,
						themeAssets: stripTrailingSlash(themeAssetsUrl),
						themes: stripTrailingSlash(themesUrl),
						admin: stripTrailingSlash(adminUrl),
						templates: stripTrailingSlash(adminTemplatesUrl),
						demo: {
							login: '/login',
							themes: '/themes',
							editor: '/editor',
							linkSiteFolder: '/editor/add-files',
							publish: '/editor/publish',
							terms: stripTrailingSlash(adminUrl) + '/terms'
						}
					}
				};
			}
		}

		function retrieveThemesRoute(req, res, next) {
			var themeIds = Object.keys(themeService.getThemes());
			var firstThemeId = themeIds[0];
			try {
				res.redirect('/themes/' + firstThemeId);
			} catch (error) {
				next(error);
			}
		}

		function retrieveThemeRoute(req, res, next) {
			var themeId = req.params.theme;

			new Promise(function(resolve, reject) {
				var themes = themeService.getThemes();
				var theme = themeService.getTheme(themeId);
				var previousTheme = themeService.getPreviousTheme(themeId);
				var nextTheme = themeService.getNextTheme(themeId);
				var templateData = {
					content: {
						themes: themes,
						theme: theme,
						previousTheme: previousTheme,
						nextTheme: nextTheme
					}
				};
				resolve(
					adminPageService.render(req, res, {
						template: 'themes/theme',
						context: templateData
					})
				);
			})
			.catch(function(error) {
				next(error);
			});
		}

		function retrieveThemeEditorRoute(req, res, next) {
			var themeIds = Object.keys(themeService.getThemes());
			var firstThemeId = themeIds[0];
			var sessionState = merge({}, req.session.state && req.session.state.editor);
			if (sessionState.theme) {
				if (sessionState.theme.config) {
					try {
						sessionState.theme.config = JSON.parse(sessionState.theme.config);
					} catch (error) {
						sessionState.theme.config = null;
					}
				}
			}
			var userModel = req.user || null;
			var siteName = req.query.name || null;
			var siteLabel = req.query.label || null;
			var themeId = (sessionState.theme && sessionState.theme.id) || (req.query.theme && req.query.theme.id) || firstThemeId;
			var themeConfigOverrides = (sessionState.theme && sessionState.theme.config) || (req.query.theme && req.query.theme.config) || null;
			var siteRoot = req.query.root ? { adapter: req.query.root.adapter, path: req.query.root.path } : null;
			var shouldShowOverlay = Boolean(sessionState && sessionState.overlay);

			new Promise(function(resolve, reject) {
				var useDummyFiles = !siteRoot;
				var theme = themeService.getTheme(themeId);
				var themeAssetsRoot = themeAssetsUrl + themeId + '/';
				var siteModel = {
					name: siteName,
					label: siteLabel,
					theme: {
						id: themeId,
						config: merge({}, theme.preview.config, themeConfigOverrides)
					},
					root: siteRoot,
					private: false,
					published: false
				};
				var adaptersMetadata = (userModel ? getUserAdaptersMetadata(userModel) : null);
				if (userModel && !siteModel.root) {
					var defaultAdapterName = userModel.adapters.default;
					var defaultAdapterPath = adaptersMetadata[defaultAdapterName].path;
					siteModel.root = {
						adapter: defaultAdapterName,
						path: defaultAdapterPath
					};
				}
				resolve(
					(useDummyFiles ? Promise.resolve(theme.preview.files) : loadFolderContents(siteRoot, adapters, userModel))
						.then(function(siteContent) {
							var adapterConfig = (useDummyFiles ? null : getSiteUploadConfig(siteRoot, adapters, userModel));
							var sitePreviewUrl = (
								useDummyFiles ?
									stripTrailingSlash(themesUrl) + '/' + themeId + '/preview' :
									'/editor/preview/' + encodeURIComponent(siteModel.root.adapter + ':' + siteModel.root.path)
							);
							var templateData = {
								content: {
									overlay: shouldShowOverlay,
									site: siteModel,
									themes: themeService.getThemes(),
									theme: themeService.getTheme(siteModel.theme.id),
									adapter: adapterConfig,
									adapters: adaptersMetadata,
									previewUrl: null,
									preview: {
										metadata: {
											siteRoot: sitePreviewUrl + '/',
											themeRoot: themeAssetsRoot,
											theme: siteModel.theme,
											preview: true,
											admin: !useDummyFiles
										},
										resource: {
											private: false,
											root: siteContent
										}
									}
								}
							};
							return adminPageService.render(req, res, {
								template: 'editor',
								context: templateData
							});
						})
				);
			})
			.catch(function(error) {
				next(error);
			});


			function getUserAdaptersMetadata(userModel) {
				return Object.keys(userModel.adapters).filter(function(adapterName) {
					return adapterName !== 'default';
				}).reduce(function(adaptersMetadata, adapterName) {
					var adapter = adapters[adapterName];
					var adapterConfig = userModel.adapters[adapterName];
					adaptersMetadata[adapterName] = adapter.getMetadata(adapterConfig);
					return adaptersMetadata;
				}, {});
			}

			function getSiteUploadConfig(siteRoot, adapters, userModel) {
				if (!siteRoot || !userModel) { return null; }
				var siteAdapter = siteRoot.adapter;
				var sitePath = siteRoot.path;
				var adapter = adapters[siteAdapter];
				var adapterOptions = userModel.adapters[siteAdapter];
				var adapterConfig = adapter.getUploadConfig(sitePath, adapterOptions);
				return adapterConfig;
			}

			function loadFolderContents(siteRoot, adapters, userModel) {
				var adapterName = siteRoot.adapter;
				var sitePath = siteRoot.path;
				var adapter = adapters[adapterName];
				var adapterOptions = userModel.adapters[adapterName];
				return adapter.loadFolderContents(sitePath, adapterOptions)
					.then(function(folder) {
						return folder.root;
					});
			}
		}

		function createThemeEditorLoginRoute(req, res, next) {
			var themeId = req.body.theme && req.body.theme.id || null;
			var themeConfig = req.body.theme && req.body.theme.config || null;
			var redirectUrl = req.body.redirect || null;

			new Promise(function(resolve, reject) {
				var adaptersHash = Object.keys(adapters).reduce(function(adaptersHash, key) {
					adaptersHash[key] = true;
					return adaptersHash;
				}, {});
				var templateData = {
					content: {
						redirect: redirectUrl || '/editor',
						adapters: adaptersHash,
						state: {
							'editor.overlay': true,
							'editor.theme.id': themeId,
							'editor.theme.config': JSON.stringify(themeConfig)
						}
					}
				};
				resolve(
					adminPageService.render(req, res, {
						template: 'login',
						context: templateData
					})
				);
			})
			.catch(function(error) {
				next(error);
			});
		}

		function createSiteFolderRoute(req, res, next) {
			var userModel = req.user || null;
			var siteRoot = req.body.root || null;

			new Promise(function(resolve, reject) {
				resolve(
					createSiteFolder(siteRoot, userModel)
						.then(function() {
							Object.keys(req.body).forEach(function(key) {
								req.query[key] = req.body[key];
								delete req.body[key];
							});
							retrieveThemeEditorRoute(req, res, next);
						})
				);
			})
			.catch(function(error) {
				next(error);
			});


			function createSiteFolder(siteRoot, userModel) {
				var userAdapters = userModel.adapters;
				var siteAdapter = siteRoot.adapter;
				var sitePath = siteRoot.path;
				var adapter = adapters[siteAdapter];
				var adapterOptions = userAdapters[siteAdapter];
				return adapter.createFolder(sitePath, adapterOptions);
			}
		}

		function createSiteRoute(req, res, next) {
			var userModel = req.user;
			var siteName = req.body.name || null;
			var siteLabel = req.body.label || null;
			var siteRoot = req.body.root || null;
			var isDefaultSite = (req.body.home === 'true');
			var isPrivate = (req.body.private === 'true');
			var isPublished = (req.body.published === 'true');
			var themeId = req.body.theme && req.body.theme.id || null;
			var themeConfigOverrides = req.body.theme && req.body.theme.config || null;
			if (typeof themeConfigOverrides === 'string') {
				try {
					themeConfigOverrides = JSON.parse(themeConfigOverrides);
				} catch(error) {
					return next(new HttpError(401));
				}
			}

			new Promise(function(resolve, reject) {
				var theme = themeService.getTheme(themeId);
				var defaultThemeConfig = expandConfigPlaceholders(theme.defaults, {
					site: {
						label: siteLabel
					}
				});
				var themeConfig = merge({}, defaultThemeConfig, themeConfigOverrides);
				var username = userModel.username;
				var siteModel = {
					'owner': username,
					'name': siteName,
					'label': siteLabel,
					'theme': {
						'id': themeId,
						'config': themeConfig
					},
					'root': siteRoot,
					'private': isPrivate,
					'users': [],
					'published': isPublished,
					'cache': null
				};
				return resolve(
					siteService.createSite(siteModel)
						.then(function(siteModel) {
							if (!isDefaultSite) { return siteModel; }
							return userService.updateUserDefaultSiteName(username, siteModel.name)
								.then(function() {
									return siteModel;
								});
						})
						.then(function(siteModel) {
							var templateData = {
								content: {
									site: siteModel
								}
							};
							return adminPageService.render(req, res, {
								template: 'editor/publish',
								context: templateData
							});
						})
				);
			})
			.catch(function(error) {
				next(error);
			});
		}
	}
};
