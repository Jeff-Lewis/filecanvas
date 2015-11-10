'use strict';

var path = require('path');
var merge = require('lodash.merge');
var express = require('express');

var constants = require('../constants');

var thumbnailer = require('../middleware/thumbnailer');
var invalidRoute = require('../middleware/invalidRoute');
var errorHandler = require('../middleware/errorHandler');

var handlebarsEngine = require('../engines/handlebars');

var AdminPageService = require('../services/AdminPageService');
var ThemeService = require('../services/ThemeService');

var THEME_MANIFEST_PATH = constants.THEME_MANIFEST_PATH;
var THEME_PREVIEW_FILES_PATH = constants.THEME_PREVIEW_FILES_PATH;

module.exports = function(options) {
	options = options || {};
	var templatesPath = options.templatesPath;
	var partialsPath = options.partialsPath;
	var themesPath = options.themesPath;
	var errorTemplatesPath = options.errorTemplatesPath;
	var themeAssetsUrl = options.themeAssetsUrl;
	var thumbnailsPath = options.thumbnailsPath;
	var thumbnailWidth = options.thumbnailWidth;
	var thumbnailHeight = options.thumbnailHeight;
	var thumbnailFormat = options.thumbnailFormat;
	var adminAssetsUrl = options.adminAssetsUrl;
	var createSiteUrl = options.createSiteUrl;

	if (!templatesPath) { throw new Error('Missing templates path'); }
	if (!errorTemplatesPath) { throw new Error('Missing error templates path'); }
	if (!themeAssetsUrl) { throw new Error('Missing theme asset root URL'); }
	if (!thumbnailsPath) { throw new Error('Missing thumbnails path'); }
	if (!thumbnailWidth) { throw new Error('Missing thumbnail width'); }
	if (!thumbnailHeight) { throw new Error('Missing thumbnail height'); }
	if (!adminAssetsUrl) { throw new Error('Missing admin asset root URL'); }
	if (!createSiteUrl) { throw new Error('Missing create site URL'); }

	var themeService = new ThemeService({
		themesPath: themesPath
	});
	var adminPageService = new AdminPageService({
		templatesPath: templatesPath,
		partialsPath: partialsPath
	});

	var app = express();

	initViewEngine(app, {
		templatesPath: templatesPath
	});
	initRoutes(app, {
		themesPath: themesPath,
		themeAssetsUrl: themeAssetsUrl,
		thumbnailsPath: thumbnailsPath,
		thumbnailWidth: thumbnailWidth,
		thumbnailHeight: thumbnailHeight,
		thumbnailFormat: thumbnailFormat
	});
	initErrorHandler(app, {
		templatesPath: errorTemplatesPath,
		template: 'error'
	});

	return app;


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
			templatesPath: templatesPath,
			template: template
		}));
	}

	function initRoutes(app, options) {
		var themesPath = options.themesPath;
		var thumbnailsPath = options.thumbnailsPath;
		var thumbnailWidth = options.thumbnailWidth;
		var thumbnailHeight = options.thumbnailHeight;
		var thumbnailFormat = options.thumbnailFormat;

		var staticServer = express.static(path.resolve(themesPath));

		app.get('/', retrieveThemesRoute);
		app.get('/:theme', retrieveThemeRoute);
		app.get('/:theme/preview', retrieveThemePreviewRoute);
		app.get('/:theme/edit', retrieveThemeEditRoute);
		app.get('/:theme/thumbnail/*', rewritePreviewThumbnailRequest, thumbnailer(themesPath, {
			width: thumbnailWidth,
			height: thumbnailHeight,
			format: thumbnailFormat,
			cache: thumbnailsPath
		}));
		app.get('/:theme/download/*', rewritePreviewDownloadRequest, staticServer);
		app.get('/:theme/metadata', rewriteManifestRequest, staticServer);
		app.get('/:theme/metadata/thumbnail', rewriteThumbnailRequest, staticServer);
		app.get('/:theme/template/:template.js', retrievePrecompiledTemplateRoute);

		app.use(invalidRoute());

		return app;


		function retrieveThemesRoute(req, res, next) {
			var themeIds = Object.keys(themeService.getThemes());
			var firstThemeId = themeIds[0];
			try {
				res.redirect('/' + firstThemeId);
			} catch (error) {
				next(error);
			}
		}

		function retrieveThemeRoute(req, res, next) {
			var themeId = req.params.theme;

			new Promise(function(resolve, reject) {
				var theme = themeService.getTheme(themeId);
				var previousTheme = themeService.getPreviousTheme(themeId);
				var nextTheme = themeService.getNextTheme(themeId);
				var templateData = {
					content: {
						theme: theme,
						previousTheme: previousTheme,
						nextTheme: nextTheme
					}
				};
				res.locals.urls = {
					assets: adminAssetsUrl
				};
				return adminPageService.render(req, res, {
					template: 'theme',
					context: templateData
				});
			}).catch(function(error) {
				next(error);
			});
		}

		function retrieveThemePreviewRoute(req, res, next) {
			var themeId = req.params.theme;

			new Promise(function(resolve, reject) {
				var theme = themeService.getTheme(themeId);
				var templateData = {
					metadata: {
						siteRoot: '/' + themeId + '/',
						themeRoot: themeAssetsUrl + themeId + '/',
						theme: {
							id: themeId,
							config: theme.preview.config
						}
					},
					resource: {
						private: false,
						root: theme.preview.files
					}
				};
				var templateId = 'index';
				renderTemplate(res, themeId, templateId, templateData, next);
			}).catch(function(error) {
				next(error);
			});
		}

		function retrieveThemeEditRoute(req, res, next) {
			var themeId = req.params.theme;

			new Promise(function(resolve, reject) {
				var theme = themeService.getTheme(themeId);
				var siteModel = {
					private: false,
					theme: {
						id: themeId,
						config: merge({}, theme.preview.config)
					},
					root: {}
				};
				var templateData = {
					title: 'Site editor',
					stylesheets: [
						adminAssetsUrl + 'css/bootstrap-colorpicker.min.css',
						adminAssetsUrl + 'css/shunt-editor.css'
					],
					scripts: [
						adminAssetsUrl + 'js/bootstrap-colorpicker.min.js',
						adminAssetsUrl + 'js/shunt-editor.js',
						'/' + siteModel.theme.id + '/template/index.js'
					],
					fullPage: true,
					navigation: false,
					footer: false,
					content: {
						site: siteModel,
						themes: themeService.getThemes(),
						adapter: null,
						preview: {
							metadata: {
								siteRoot: '/' + siteModel.theme.id + '/preview',
								themeRoot: themeAssetsUrl + siteModel.theme.id + '/',
								theme: siteModel.theme,
								preview: true,
								admin: false
							},
							resource: siteModel
						}
					}
				};
				res.locals.urls = {
					assets: adminAssetsUrl,
					createSite: createSiteUrl
				};
				return adminPageService.render(req, res, {
					template: 'theme/edit',
					context: templateData
				});
			})
			.catch(function(error) {
				next(error);
			});
		}

		function rewritePreviewThumbnailRequest(req, res, next) {
			var themeId = req.params.theme;
			var imagePath = req.params[0];
			try {
				req.url = '/' + themeId + '/' + THEME_PREVIEW_FILES_PATH + '/' + imagePath;
				next();
			} catch (error) {
				next(error);
			}
		}

		function rewritePreviewDownloadRequest(req, res, next) {
			var themeId = req.params.theme;
			var filePath = req.params[0];
			try {
				req.url = '/' + themeId + '/' + THEME_PREVIEW_FILES_PATH + '/' + filePath;
				next();
			} catch (error) {
				next(error);
			}
		}

		function rewriteManifestRequest(req, res, next) {
			var themeId = req.params.theme;
			try {
				req.url = '/' + themeId + '/' + THEME_MANIFEST_PATH;
				next();
			} catch (error) {
				next(error);
			}
		}

		function rewriteThumbnailRequest(req, res, next) {
			var themeId = req.params.theme;
			try {
				var theme = themeService.getTheme(themeId);
				var thumbnailPath = theme.thumbnail;
				req.url = '/' + themeId + '/' + thumbnailPath;
				next();
			} catch (error) {
				next(error);
			}
		}

		function retrievePrecompiledTemplateRoute(req, res, next) {
			var themeId = req.params.theme;
			var templateId = req.params.template;
			new Promise(function(resolve, reject) {
				var template = themeService.getThemeTemplate(themeId, templateId);
				resolve(
					template.serialize()
						.then(function(serializedTemplate) {
							sendPrecompiledTemplate(res, serializedTemplate);
						})
				);
			})
			.catch(function(error) {
				return next(error);
			});
		}

		function renderTemplate(res, themeId, templateId, context, next) {
			res.format({
				'text/html': function() {
					Promise.resolve(
						themeService.getThemeTemplate(themeId, templateId)
					).then(function(template) {
						return template.render(context);
					})
					.then(function(output) {
						res.send(output);
					})
					.catch(function(error) {
						next(error);
					});
				},
				'application/json': function() {
					res.json(context);
				}
			});
		}

		function sendPrecompiledTemplate(res, template) {
			res.set('Content-Type', 'text/javscript');
			res.send(template);
		}
	}
};
