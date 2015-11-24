'use strict';

var path = require('path');
var express = require('express');
var cors = require('cors');

var constants = require('../constants');

var thumbnailer = require('../middleware/thumbnailer');
var invalidRoute = require('../middleware/invalidRoute');
var errorHandler = require('../middleware/errorHandler');

var ThemeService = require('../services/ThemeService');

var THEME_MANIFEST_PATH = constants.THEME_MANIFEST_PATH;
var THEME_PREVIEW_FILES_PATH = constants.THEME_PREVIEW_FILES_PATH;

module.exports = function(options) {
	options = options || {};
	var host = options.host;
	var errorTemplatesPath = options.errorTemplatesPath;
	var themesPath = options.themesPath;
	var themeAssetsUrl = options.themeAssetsUrl;
	var thumbnailsPath = options.thumbnailsPath;
	var thumbnailWidth = options.thumbnailWidth;
	var thumbnailHeight = options.thumbnailHeight;
	var thumbnailFormat = options.thumbnailFormat;

	if (!host) { throw new Error('Missing host name'); }
	if (!errorTemplatesPath) { throw new Error('Missing error templates path'); }
	if (!themesPath) { throw new Error('Missing themes path'); }
	if (!themeAssetsUrl) { throw new Error('Missing theme asset root URL'); }
	if (!thumbnailsPath) { throw new Error('Missing thumbnails path'); }
	if (!thumbnailWidth) { throw new Error('Missing thumbnail width'); }
	if (!thumbnailHeight) { throw new Error('Missing thumbnail height'); }

	var themeService = new ThemeService({
		themesPath: themesPath
	});

	var app = express();

	initCors(app);
	initRoutes(app);
	initErrorHandler(app, {
		templatesPath: errorTemplatesPath,
		template: 'error'
	});

	return app;


	function initCors(app) {
		app.use(cors({
			origin: new RegExp('^https?://\\w+\\.' + host + '(?::\\d+)?$')
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

	function initRoutes(app) {
		var staticServer = express.static(path.resolve(themesPath));

		app.get('/:theme/metadata', rewriteManifestRequest, staticServer);
		app.get('/:theme/metadata/defaults', retrieveThemeDefaultsRoute);
		app.get('/:theme/metadata/thumbnail', rewriteThumbnailRequest, staticServer);
		app.get('/:theme/template/:template.js', retrievePrecompiledTemplateRoute);
		app.get('/:theme/preview', retrieveThemePreviewRoute);
		app.get('/:theme/preview/thumbnail/*', rewritePreviewThumbnailRequest, thumbnailer(themesPath, {
			width: thumbnailWidth,
			height: thumbnailHeight,
			format: thumbnailFormat,
			cache: thumbnailsPath
		}));
		app.get('/:theme/preview/download/*', rewritePreviewDownloadRequest, staticServer);

		return app;


		function rewriteManifestRequest(req, res, next) {
			var themeId = req.params.theme;
			try {
				req.url = '/' + themeId + '/' + THEME_MANIFEST_PATH;
				next();
			} catch (error) {
				next(error);
			}
		}

		function retrieveThemeDefaultsRoute(req, res, next) {
			var themeId = req.params.theme;
			try {
				var theme = themeService.getTheme(themeId);
				res.json(theme.defaults);
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
				resolve(
					themeService.serializeThemeTemplate(themeId, templateId)
						.then(function(serializedTemplate) {
							sendPrecompiledTemplate(res, serializedTemplate);
						})
				);
			})
			.catch(function(error) {
				return next(error);
			});
		}

		function retrieveThemePreviewRoute(req, res, next) {
			var themeId = req.params.theme;

			new Promise(function(resolve, reject) {
				var theme = themeService.getTheme(themeId);
				var templateData = {
					metadata: {
						siteRoot: '/' + themeId + '/preview/',
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
				renderThemeTemplate(res, themeId, templateId, templateData, next);
				resolve();
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

		function sendPrecompiledTemplate(res, template) {
			res.set('Content-Type', 'text/javscript');
			res.send(template);
		}

		function renderThemeTemplate(res, themeId, templateId, context, next) {
			res.format({
				'text/html': function() {
					Promise.resolve(
						themeService.renderThemeTemplate(themeId, templateId, context)
					)
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

	}
};
