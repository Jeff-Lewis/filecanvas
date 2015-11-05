'use strict';

var path = require('path');
var express = require('express');

var constants = require('constants');

var invalidRoute = require('../middleware/invalidRoute');
var errorHandler = require('../middleware/errorHandler');

var loadThemes = require('../utils/loadThemes');

var handlebarsEngine = require('../engines/handlebars');
var handlebarsTemplateService = require('../globals/handlebarsTemplateService');

var HttpError = require('../errors/HttpError');

var THEME_MANIFEST_PATH = constants.THEME_MANIFEST_PATH;

module.exports = function(options) {
	options = options || {};
	var templatesPath = options.templatesPath;
	var errorTemplatesPath = options.errorTemplatesPath;
	var themeAssetsUrl = options.themeAssetsUrl;

	if (!templatesPath) { throw new Error('Missing templates path'); }
	if (!errorTemplatesPath) { throw new Error('Missing error templates path'); }
	if (!themeAssetsUrl) { throw new Error('Missing themes root URL'); }

	var themes = loadThemes(options.templatesPath);

	var app = express();

	initViewEngine(app, {
		templatesPath: templatesPath
	});
	initRoutes(app, {
		themesPath: templatesPath,
		themeAssetsUrl: themeAssetsUrl,
		themes: themes
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
		var themes = options.themes;

		var staticServer = express.static(path.resolve(themesPath));

		app.get('/:theme', retrieveThemePreviewRoute);
		app.get('/:theme/metadata', rewriteManifestRequest, staticServer);
		app.get('/:theme/thumbnail', rewriteThumbnailRequest, staticServer);
		app.get('/:theme/template/:template.js', retrievePrecompiledTemplateRoute);

		app.use(invalidRoute());

		return app;


		function retrieveThemePreviewRoute(req, res, next) {
			return next(new HttpError(501));
		}

		function rewriteManifestRequest(req, res, next) {
			var themeId = req.params.theme;
			req.url = '/' + themeId + '/' + THEME_MANIFEST_PATH;
			next();
		}

		function rewriteThumbnailRequest(req, res, next) {
			var themeId = req.params.theme;
			if (!(themeId in themes)) {
				return next(new HttpError(404));
			}
			var theme = themes[themeId];
			var thumbnailPath = theme.thumbnail;
			req.url = '/' + themeId + '/' + thumbnailPath;
			next();
		}

		function retrievePrecompiledTemplateRoute(req, res, next) {
			var themeId = req.params.theme;
			var templateId = req.params.template;
			if (!(themeId in themes)) {
				return next(new HttpError(404));
			}
			var theme = themes[themeId];
			if (!(templateId in theme.templates)) {
				return next(new HttpError(404));
			}
			var templateFilename = theme.templates[templateId];
			var templatePath = path.resolve(themesPath, themeId, templateFilename);
			retrieveSerializedTemplate(templatePath, { name: templateId })
				.then(function(serializedTemplate) {
					res.set('Content-Type', 'text/javscript');
					res.send(serializedTemplate);
				})
				.catch(function(error) {
					return next(error);
				});


			function retrieveSerializedTemplate(templatePath, options) {
				options = options || {};
				var templateName = options.name;
				return handlebarsTemplateService.serialize(templatePath)
					.then(function(serializedTemplate) {
						return wrapTemplate(serializedTemplate, templateName);
					});


				function wrapTemplate(template, templateName) {
					return '(Handlebars.templates=Handlebars.templates||{})["' + templateName + '"]=' + template + ';';
				}
			}
		}
	}
};
