'use strict';

var path = require('path');
var objectAssign = require('object-assign');
var merge = require('lodash.merge');
var express = require('express');

var session = require('../middleware/session');
var forms = require('../middleware/forms');
var redirect = require('../middleware/redirect');
var invalidRoute = require('../middleware/invalidRoute');

var loadUploadAdapter = require('../utils/loadUploadAdapter');
var stripTrailingSlash = require('../utils/stripTrailingSlash');
var parseLocation = require('../utils/parseLocation');
var getSubdomainUrl = require('../utils/getSubdomainUrl');
var parseShortcutUrl = require('../utils/parseShortcutUrl');

var handlebarsEngine = require('../engines/handlebars');

var ThemeService = require('../services/ThemeService');
var FileUploadService = require('../services/FileUploadService');
var AdminPageService = require('../services/AdminPageService');

var HttpError = require('../errors/HttpError');
var FileModel = require('../models/FileModel');

module.exports = function(database, cache, options) {
	var host = options.host;
	var cookieSecret = options.cookieSecret;
	var sessionStore = options.sessionStore;
	var sessionDuration = options.sessionDuration;
	var templatesPath = options.templatesPath;
	var partialsPath = options.partialsPath;
	var themesPath = options.themesPath;
	var adminUrl = options.adminUrl;
	var adminAssetsUrl = options.adminAssetsUrl;
	var adminTemplatesUrl = options.adminTemplatesUrl;
	var themesUrl = options.themesUrl;
	var themeAssetsUrl = options.themeAssetsUrl;
	var wwwUrl = options.wwwUrl;
	var uploadAdapterConfig = options.uploadAdapter;
	var analyticsConfig = options.analytics;

	if (!database) { throw new Error('Missing database'); }
	if (!cache) { throw new Error('Missing key-value store'); }
	if (!host) { throw new Error('Missing host details'); }
	if (!cookieSecret) { throw new Error('Missing cookie secret'); }
	if (!sessionStore) { throw new Error('Missing session store URL'); }
	if (!sessionDuration) { throw new Error('Missing session duration'); }
	if (!templatesPath) { throw new Error('Missing templates path'); }
	if (!partialsPath) { throw new Error('Missing partials path'); }
	if (!themesPath) { throw new Error('Missing themes path'); }
	if (!adminUrl) { throw new Error('Missing admin URL'); }
	if (!adminAssetsUrl) { throw new Error('Missing admin asset root URL'); }
	if (!adminTemplatesUrl) { throw new Error('Missing admin templates URL'); }
	if (!themesUrl) { throw new Error('Missing themes URL'); }
	if (!themeAssetsUrl) { throw new Error('Missing theme assets URL'); }
	if (!wwwUrl) { throw new Error('Missing www URL'); }
	if (!uploadAdapterConfig) { throw new Error('Missing upload adapter configuration'); }
	if (!analyticsConfig) { throw new Error('Missing analytics configuration'); }

	var uploadAdapter = loadUploadAdapter(uploadAdapterConfig);

	var themeService = new ThemeService({
		themesPath: themesPath
	});

	var fileUploadService = new FileUploadService({
		adapter: uploadAdapter
	});
	var adminPageService = new AdminPageService({
		templatesPath: templatesPath,
		partialsPath: partialsPath,
		sessionMiddleware: initAdminSession,
		analytics: analyticsConfig
	});

	var app = express();
	app.use(session({
		cookieSecret: cookieSecret,
		store: sessionStore,
		ttl: sessionDuration
	}));
	app.use(forms());

	initRoutes(app);
	initErrorHandler(app);
	initViewEngine(app, {
		templatesPath: templatesPath
	});

	return app;


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

	function initAdminSession(req, res, next) {
		var sessionData = getSessionData(req);
		Object.keys(sessionData).forEach(function(key) {
			res.locals[key] = sessionData[key];
		});
		next();


		function getSessionData(req) {
			var currentSubdomain = (req.subdomains ? req.subdomains.join('.') : null);
			var location = parseLocation(objectAssign({}, host, {
				hostname: (currentSubdomain ? currentSubdomain + '.' : '') + host.hostname,
				path: req.originalUrl
			}));
			var domainUrlPattern = getSubdomainUrl('$0', { host: host });
			return {
				location: location,
				urls: {
					root: location.protocol + '//' + location.host,
					webroot: null,
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
						signup: wwwUrl + '#sign-up',
						security: stripTrailingSlash(wwwUrl) + '/security',
						terms: stripTrailingSlash(wwwUrl) + '/terms',
						privacy: stripTrailingSlash(wwwUrl) + '/privacy'
					}
				}
			};
		}
	}

	function initRoutes(app) {
		app.get('/', redirect('/themes'));
		app.get('/themes', retrieveThemesRoute);
		app.get('/themes/:theme', retrieveThemeRoute);
		app.get('/editor', retrieveThemeEditorRoute);
		app.post('/editor/upload/:filename', prefixSessionUploadPath('filename'), fileUploadService.middleware());
		app.get('/editor/preview/download/*', prefixSessionUploadPath(), retrieveUserFileDownloadRoute);
		app.get('/editor/preview/media/*', prefixSessionUploadPath(), retrieveUserFilePreviewRoute);
		app.get('/editor/preview/thumbnail/*', prefixSessionUploadPath(), retrieveUserFileThumbnailRoute);
		app.get('/editor/preview/redirect/*', prefixSessionUploadPath(), retrieveUserFileRedirectRoute);


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
			var themeId = (req.query.theme && req.query.theme.id) || firstThemeId;
			var themeConfigOverrides = (req.query.theme && req.query.theme.config) || null;

			new Promise(function(resolve, reject) {
				var theme = themeService.getTheme(themeId);
				var themeAssetsRoot = themesUrl + themeId + '/assets/';
				var siteModel = {
					name: null,
					label: null,
					theme: {
						id: themeId,
						config: merge({}, theme.demo, themeConfigOverrides)
					},
					root: new FileModel({
						path: '/',
						directory: true
					}),
					private: false,
					published: false
				};
				var adapterUploadConfig = {
					name: 'demo',
					config: {
						uploadUrl: '/editor/upload',
						thumbnailMimeTypes: [
							'image/gif',
							'image/jpeg',
							'image/png',
							'image/svg+xml'
						]
					}
				};
				var sitePreviewUrl = '/editor/preview/';
				var templateData = {
					content: {
						previewUrl: null,
						site: siteModel,
						themes: themeService.getThemes(),
						theme: themeService.getTheme(siteModel.theme.id),
						adapter: adapterUploadConfig,
						preview: {
							metadata: {
								siteRoot: sitePreviewUrl,
								themeRoot: themeAssetsRoot,
								libRoot: themeAssetsUrl,
								theme: siteModel.theme,
								preview: true,
								admin: true
							},
							resource: {
								private: siteModel.private,
								root: siteModel.root
							}
						}
					}
				};
				resolve(
					adminPageService.render(req, res, {
						template: 'editor',
						context: templateData
					})
				);
			})
			.catch(function(error) {
				next(error);
			});
		}

		function prefixSessionUploadPath(param) {
			return function (req, res, next) {
				var filename = (param ? req.params[param] : req.params[0]);
				if (!filename) { return next(new HttpError(403)); }
				var sessionId = req.sessionID;
				req.params.filename = sessionId + '/' + filename;
				next();
			};
		}

		function retrieveUserFileDownloadRoute(req, res, next) {
			var filename = req.params.filename;
			if (!filename) { return next(new HttpError(403)); }
			var downloadUrl = uploadAdapter.getDownloadUrl(filename);
			res.redirect(downloadUrl);
		}

		function retrieveUserFilePreviewRoute(req, res, next) {
			var filename = req.params.filename;
			if (!filename) { return next(new HttpError(403)); }
			var previewUrl = uploadAdapter.getDownloadUrl(filename);
			res.redirect(previewUrl);
		}

		function retrieveUserFileThumbnailRoute(req, res, next) {
			var filename = req.params.filename;
			if (!filename) { return next(new HttpError(403)); }
			var thumbnailUrl = uploadAdapter.getDownloadUrl(filename);
			res.redirect(thumbnailUrl);
		}

		function retrieveUserFileRedirectRoute(req, res, next) {
			var filename = req.params.filename;
			if (!filename) { return next(new HttpError(403)); }
			var shortcutType = path.extname(filename).substr('.'.length);
			uploadAdapter.readFile(filename)
				.then(function(fileContents) {
					var shortcutUrl = parseShortcutUrl(fileContents, { type: shortcutType });
					res.redirect(shortcutUrl);
				})
				.catch(function(error) {
					next(error);
				});
		}
	}
};
