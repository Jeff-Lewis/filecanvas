'use strict';

var path = require('path');
var express = require('express');
var cors = require('cors');

var constants = require('../constants');

var invalidRoute = require('../middleware/invalidRoute');
var errorHandler = require('../middleware/errorHandler');

var ThemeService = require('../services/ThemeService');

var THEME_MANIFEST_PATH = constants.THEME_MANIFEST_PATH;

module.exports = function(options) {
	options = options || {};
	var hostname = options.hostname;
	var errorTemplatesPath = options.errorTemplatesPath;
	var themesPath = options.themesPath;
	var themeAssetsUrl = options.themeAssetsUrl;

	if (!hostname) { throw new Error('Missing hostname'); }
	if (!errorTemplatesPath) { throw new Error('Missing error templates path'); }
	if (!themesPath) { throw new Error('Missing themes path'); }
	if (!themeAssetsUrl) { throw new Error('Missing theme asset root URL'); }

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
			origin: new RegExp('^https?://\\w+\\.' + hostname + '(?::\\d+)?$')
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
		var staticServer = express.static(path.resolve(themesPath), { redirect: false });

		app.get('/:theme/theme.json', rewriteManifestRequest, staticServer);
		app.get('/:theme/thumbnail.png', rewriteThumbnailRequest, staticServer);
		app.get('/:theme/preview/*', rewriteThemePreviewRequest, staticServer);
		app.get('/:theme/templates/:template.js', retrievePrecompiledTemplateRoute);

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

		function rewriteThemePreviewRequest(req, res, next) {
			var themeId = req.params.theme;
			var resourcePath = req.params[0] || null;
			try {
				req.url = '/' + themeId + '/preview' + (resourcePath ? '/' + resourcePath : '');
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

		function sendPrecompiledTemplate(res, template) {
			res.set('Content-Type', 'text/javscript');
			res.send(template);
		}
	}
};
