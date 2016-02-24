'use strict';

var objectAssign = require('object-assign');
var merge = require('lodash.merge');
var express = require('express');
var composeMiddleware = require('compose-middleware').compose;

var previewApp = require('./demo/preview');

var session = require('../middleware/session');
var forms = require('../middleware/forms');
var sessionState = require('../middleware/sessionState');
var redirect = require('../middleware/redirect');
var invalidRoute = require('../middleware/invalidRoute');
var errorHandler = require('../middleware/errorHandler');

var demoAuth = require('./demo/middleware/demoAuth');

var loadLoginAdapters = require('../utils/loadLoginAdapters');
var loadStorageAdapters = require('../utils/loadStorageAdapters');
var loadUploadAdapter = require('../utils/loadUploadAdapter');
var stripTrailingSlash = require('../utils/stripTrailingSlash');
var parseLocation = require('../utils/parseLocation');
var getSubdomainUrl = require('../utils/getSubdomainUrl');

var handlebarsEngine = require('../engines/handlebars');

var UserService = require('../services/UserService');
var SiteService = require('../services/SiteService');
var ThemeService = require('../services/ThemeService');
var FileUploadService = require('../services/FileUploadService');
var AdminPageService = require('../services/AdminPageService');

var HttpError = require('../errors/HttpError');

module.exports = function(database, cache, options) {
	var host = options.host;
	var cookieSecret = options.cookieSecret;
	var sessionStore = options.sessionStore;
	var sessionDuration = options.sessionDuration;
	var templatesPath = options.templatesPath;
	var partialsPath = options.partialsPath;
	var errorTemplatesPath = options.errorTemplatesPath;
	var themesPath = options.themesPath;
	var adminUrl = options.adminUrl;
	var adminAssetsUrl = options.adminAssetsUrl;
	var adminTemplatesUrl = options.adminTemplatesUrl;
	var themesUrl = options.themesUrl;
	var wwwUrl = options.wwwUrl;
	var adaptersConfig = options.adapters;
	var uploadAdapterConfig = options.uploadAdapter || null;

	if (!database) { throw new Error('Missing database'); }
	if (!cache) { throw new Error('Missing key-value store'); }
	if (!host) { throw new Error('Missing host details'); }
	if (!cookieSecret) { throw new Error('Missing cookie secret'); }
	if (!sessionStore) { throw new Error('Missing session store URL'); }
	if (!sessionDuration) { throw new Error('Missing session duration'); }
	if (!templatesPath) { throw new Error('Missing templates path'); }
	if (!partialsPath) { throw new Error('Missing partials path'); }
	if (!errorTemplatesPath) { throw new Error('Missing error templates path'); }
	if (!themesPath) { throw new Error('Missing themes path'); }
	if (!adminUrl) { throw new Error('Missing admin URL'); }
	if (!adminAssetsUrl) { throw new Error('Missing admin asset root URL'); }
	if (!adminTemplatesUrl) { throw new Error('Missing admin templates URL'); }
	if (!themesUrl) { throw new Error('Missing themes URL'); }
	if (!wwwUrl) { throw new Error('Missing www URL'); }
	if (!adaptersConfig) { throw new Error('Missing adapters configuration'); }
	if (!uploadAdapterConfig) { throw new Error('Missing upload adapter configuration'); }

	var loginAdapters = loadLoginAdapters('demo', adaptersConfig, database);
	var storageAdapters = loadStorageAdapters(adaptersConfig, database, cache);
	var uploadAdapter = loadUploadAdapter(uploadAdapterConfig);

	var userService = new UserService(database);
	var siteService = new SiteService(database, {
		host: host,
		adapters: storageAdapters
	});
	var themeService = new ThemeService({
		themesPath: themesPath
	});
	var fileUploadService = new FileUploadService({
		adapter: uploadAdapter
	});
	var adminPageService = new AdminPageService({
		templatesPath: templatesPath,
		partialsPath: partialsPath,
		sessionMiddleware: initAdminSession
	});

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
	initRoutes(app);
	initSitePreview(app, {
		adapters: storageAdapters
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

		app.use('/', demoAuth(database, {
			adapters: adapters,
			login: '/login',
			failure: '/login'
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

	function initAdminSession(req, res, next) {
		var sessionData = getSessionData(req);
		Object.keys(sessionData).forEach(function(key) {
			res.locals[key] = sessionData[key];
		});
		next();


		function getSessionData(req) {
			var userModel = req.user || null;
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
					home: wwwUrl,
					assets: adminAssetsUrl,
					themes: stripTrailingSlash(themesUrl),
					templates: stripTrailingSlash(adminTemplatesUrl),
					demo: {
						login: '/login',
						themes: '/themes',
						editor: '/editor',
						upload: '/editor/upload',
						linkSiteFolder: '/editor/add-files',
						createUser: '/editor/create-user',
						createSite: '/editor/canvases',
						sites: '/editor/canvases'
					},
					admin: {
						root: adminUrl
					},
					www: {
						root: wwwUrl,
						security: stripTrailingSlash(wwwUrl) + '/security',
						terms: stripTrailingSlash(wwwUrl) + '/terms',
						privacy: stripTrailingSlash(wwwUrl) + '/privacy'
					}
				}
			};
		}
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
		app.get('/themes/:theme', retrieveThemeRoute);
		app.get('/editor', retrieveThemeEditorRoute);
		app.post('/editor/upload/:filename', createThemeEditorUploadRoute);

		var ensureLogin = ensureAuth('/editor', { allowPending: true });
		var ensureUser = composeMiddleware(ensureLogin, ensureAuth(retrieveCreateUserRoute, { allowPending: false }));

		app.get('/login', retrieveThemeEditorLoginRoute);
		app.post('/editor/add-files', ensureLogin, createSiteFolderRoute, moveRequestBodyIntoQuery, retrieveThemeEditorRoute);
		app.get('/editor/create-user', ensureLogin, retrieveCreateUserRoute);
		app.post('/editor/create-user', ensureLogin, createUserRoute);
		app.post('/editor/canvases', ensureUser, createSiteRoute);
		app.get('/editor/canvases/:site', ensureUser, retrieveSitePublishRoute);
		app.put('/editor/canvases/:site', ensureUser, updateSiteRoute);


		function ensureAuth(loginRoute, options) {
			options = options || {};
			var allowPendingUser = Boolean(options.allowPending);
			return function(req, res, next) {
				if (req.isAuthenticated() && (allowPendingUser || !req.user.pending)) {
					next();
				} else {
					if (typeof loginRoute === 'string') {
						res.redirect(loginRoute);
					} else if (typeof loginRoute === 'function') {
						loginRoute(req, res, next);
					}
				}
			};
		}

		function moveRequestBodyIntoQuery(req, res, next) {
			Object.keys(req.body).forEach(function(key) {
				req.query[key] = req.body[key];
				delete req.body[key];
			});
			next();
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
				var themeAssetsRoot = themesUrl + themeId + '/assets/';
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
					(useDummyFiles ? Promise.resolve(theme.preview.files) : loadFolderContents(siteRoot, storageAdapters, userModel))
						.then(function(siteContent) {
							var adapterConfig = (useDummyFiles ? null : getSiteUploadConfig(siteRoot, storageAdapters, userModel));
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
					var adapter = storageAdapters[adapterName];
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

		function createThemeEditorUploadRoute(req, res, next) {
			var filename = req.params.filename;

			new Promise(function(resolve, reject) {
				var renamedFilename = fileUploadService.generateUniqueFilename(filename);
				var uploadPath = 'demo/' + renamedFilename;
				resolve(
					fileUploadService.generateRequest(uploadPath)
				);
			})
			.then(function(response) {
				res.json(response);
			})
			.catch(function(error) {
				next(error);
			});
		}

		function retrieveThemeEditorLoginRoute(req, res, next) {
			var themeId = req.query.theme && req.query.theme.id || null;
			var themeConfig = req.query.theme && req.query.theme.config || null;
			var redirectUrl = req.query.redirect || '/editor';

			new Promise(function(resolve, reject) {
				var adaptersHash = Object.keys(loginAdapters).reduce(function(adaptersHash, key) {
					adaptersHash[key] = true;
					return adaptersHash;
				}, {});
				var templateData = {
					content: {
						redirect: redirectUrl,
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
							next();
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
				var adapter = storageAdapters[siteAdapter];
				var adapterOptions = userAdapters[siteAdapter];
				return adapter.createFolder(sitePath, adapterOptions);
			}
		}

		function retrieveCreateUserRoute(req, res, next) {
			var pendingSiteModel = {
				name: req.body.name || null,
				label: req.body.label || null,
				root: req.body.root || null,
				home: (req.body.home === 'true'),
				private: (req.body.private === 'true'),
				published: (req.body.published === 'true'),
				theme: {
					id: req.body.theme && req.body.theme.id || null,
					config: req.body.theme && req.body.theme.config || null
				}
			};
			if (typeof pendingSiteModel.theme.config === 'string') {
				try {
					pendingSiteModel.theme.config = JSON.parse(pendingSiteModel.theme.config);
				} catch(error) {
					return next(new HttpError(400));
				}
			}

			new Promise(function(resolve, reject) {
				var templateData = {
					content: {
						site: pendingSiteModel
					}
				};
				resolve(
					adminPageService.render(req, res, {
						template: 'editor/create-user',
						context: templateData
					})
				);
			})
			.catch(function(error) {
				next(error);
			});
		}

		function createUserRoute(req, res, next) {
			var pendingUserModel = req.user;
			var userModel = {
				username: req.body.username,
				firstName: req.body.firstName,
				lastName: req.body.lastName,
				email: req.body.email,
				defaultSite: null,
				adapters: pendingUserModel.adapters
			};

			new Promise(function(resolve, reject) {
				resolve(
					userService.createUser(userModel)
						.then(function(userModel) {
							req.login(userModel, function(error) {
								if (error) { return next(error); }
								createSiteRoute(req, res, next);
							});
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
					return next(new HttpError(400));
				}
			}

			new Promise(function(resolve, reject) {
				var theme = themeService.getTheme(themeId);
				var themeConfigDefaults = theme.defaults;
				var themeConfig = merge({}, themeConfigDefaults, themeConfigOverrides);
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
				resolve(
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
								template: 'editor/create-site-success',
								context: templateData
							});
						})
				);
			})
			.catch(function(error) {
				next(error);
			});
		}

		function retrieveSitePublishRoute(req, res, next) {
			var userModel = req.user;
			var username = userModel.username;
			var siteName = req.params.site;

			new Promise(function(resolve, reject) {
				resolve(
					siteService.retrieveSite(username, siteName)
						.then(function(siteModel) {
							var templateData = {
								content: {
									site: siteModel
								}
							};
							adminPageService.render(req, res, {
								template: 'editor/publish-site',
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
			var userModel = req.user;
			var username = userModel.username;
			var defaultSiteName = userModel.defaultSite;
			var siteName = req.params.site;

			var updates = {};
			if (req.body.name) { updates.name = req.body.name; }
			if (req.body.label) { updates.label = req.body.label; }
			if (req.body.root) { updates.root = req.body.root || null; }
			if (req.body.private) { updates.private = req.body.private === 'true'; }
			if (req.body.published) { updates.published = req.body.published === 'true'; }

			var themeId = req.body.theme && req.body.theme.id || null;
			var themeConfigOverrides = req.body.theme && req.body.theme.config || null;

			new Promise(function(resolve, reject) {
				if (themeId || (themeId && themeConfigOverrides)) {
					var theme = themeService.getTheme(themeId);
					var themeConfigDefaults = theme.defaults;
					var themeConfig = merge({}, themeConfigDefaults, themeConfigOverrides);
					updates.theme = {
						id: themeId,
						config: themeConfig
					};
				}

				var isDefaultSite = siteName === defaultSiteName;
				var isUpdatedDefaultSite = ('home' in req.body ? req.body.home === 'true' : isDefaultSite);
				var updatedSiteName = ('name' in updates ? updates.name : siteName);
				resolve(
					siteService.updateSite(username, siteName, updates)
						.then(function() {
							var updatedDefaultSiteName = (isUpdatedDefaultSite ? updatedSiteName : (isDefaultSite ? null : defaultSiteName));
							if (updatedDefaultSiteName === defaultSiteName) { return; }
							return userService.updateUserDefaultSiteName(username, updatedDefaultSiteName);
						})
						.then(function() {
							var templateData = {
								content: {
									site: {
										owner: username,
										name: updatedSiteName
									}
								}
							};
							return adminPageService.render(req, res, {
								template: 'editor/publish-site-success',
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
