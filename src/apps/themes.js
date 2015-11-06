'use strict';

var path = require('path');
var express = require('express');

var constants = require('../constants');

var thumbnailer = require('../middleware/thumbnailer');
var invalidRoute = require('../middleware/invalidRoute');
var errorHandler = require('../middleware/errorHandler');

var loadThemes = require('../utils/loadThemes');

var handlebarsEngine = require('../engines/handlebars');
var handlebarsTemplateService = require('../globals/handlebarsTemplateService');

var HttpError = require('../errors/HttpError');

var THEME_MANIFEST_PATH = constants.THEME_MANIFEST_PATH;
var THEME_PREVIEW_FILES_PATH = constants.THEME_PREVIEW_FILES_PATH;

module.exports = function(options) {
	options = options || {};
	var templatesPath = options.templatesPath;
	var themesPath = options.themesPath;
	var errorTemplatesPath = options.errorTemplatesPath;
	var themeAssetsUrl = options.themeAssetsUrl;
	var thumbnailsPath = options.thumbnailsPath;
	var thumbnailWidth = options.thumbnailWidth;
	var thumbnailHeight = options.thumbnailHeight;
	var thumbnailFormat = options.thumbnailFormat;

	if (!templatesPath) { throw new Error('Missing templates path'); }
	if (!errorTemplatesPath) { throw new Error('Missing error templates path'); }
	if (!themeAssetsUrl) { throw new Error('Missing theme asset root URL'); }
	if (!thumbnailsPath) { throw new Error('Missing thumbnails path'); }
	if (!thumbnailWidth) { throw new Error('Missing thumbnail width'); }
	if (!thumbnailHeight) { throw new Error('Missing thumbnail height'); }

	var themes = loadThemes(themesPath, {
		preview: true
	});

	var app = express();

	initViewEngine(app, {
		templatesPath: templatesPath
	});
	initRoutes(app, {
		themesPath: themesPath,
		themeAssetsUrl: themeAssetsUrl,
		themes: themes,
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
		var themes = options.themes;

		var staticServer = express.static(path.resolve(themesPath));

		app.get('/:theme/preview', retrieveThemePreviewRoute);
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


		function retrieveThemePreviewRoute(req, res, next) {
			var themeId = req.params.theme;
			if (!(themeId in themes)) {
				return next(new HttpError(404));
			}
			var theme = themes[themeId];
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
			try {
				var template = path.resolve(themesPath, themeId + '/index');
				renderTemplate(res, template, templateData);
			} catch(error) {
				next(error);
			}
		}

		function rewritePreviewThumbnailRequest(req, res, next) {
			var themeId = req.params.theme;
			var imagePath = req.params[0];
			req.url = '/' + themeId + '/' + THEME_PREVIEW_FILES_PATH + '/' + imagePath;
			next();
		}

		function rewritePreviewDownloadRequest(req, res, next) {
			var themeId = req.params.theme;
			var filePath = req.params[0];
			req.url = '/' + themeId + '/' + THEME_PREVIEW_FILES_PATH + '/' + filePath;
			next();
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
					renderPrecompiledTemplate(res, serializedTemplate);
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

		function renderTemplate(res, template, context) {
			res.format({
				'text/html': function() {
					res.render(template, context);
				},
				'application/json': function() {
					res.json(context);
				}
			});
		}

		function renderPrecompiledTemplate(res, template) {
			res.set('Content-Type', 'text/javscript');
			res.send(template);
		}
	}
};
