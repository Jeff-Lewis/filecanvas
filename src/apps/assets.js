'use strict';

var express = require('express');
var cors = require('cors');
var composeMiddleware = require('compose-middleware').compose;

var invalidRoute = require('../middleware/invalidRoute');
var errorHandler = require('../middleware/errorHandler');

var HttpError = require('../errors/HttpError');

module.exports = function(options) {
	options = options || {};
	var themesPath = options.themesPath;
	var adminAssetsPath = options.adminAssetsPath;
	var errorTemplatesPath = options.errorTemplatesPath;

	if (!themesPath) { throw new Error('Missing themes path'); }
	if (!adminAssetsPath) { throw new Error('Missing admin assets path'); }
	if (!errorTemplatesPath) { throw new Error('Missing error templates path'); }

	var app = express();

	app.use(cors());

	app.use('/themes', createThemeAssetsApp(themesPath));
	app.use('/admin', express.static(adminAssetsPath));

	app.use(invalidRoute());
	app.use(errorHandler({
		templatesPath: errorTemplatesPath,
		template: 'error'
	}));

	return app;


	function createThemeAssetsApp(themesPath) {
		return composeMiddleware([
			rewriteThemeAssetsUrl,
			express.static(themesPath)
		]);


		function rewriteThemeAssetsUrl(req, res, next) {
			var THEME_RESOURCE_URL_REGEXP = /^\/(.+?)\/(.+)$/;
			var results = THEME_RESOURCE_URL_REGEXP.exec(req.url);
			if (!results) { return next(new HttpError(404)); }
			var themeName = results[1];
			var filePath = results[2];
			req.url = '/' + themeName + '/assets/' + filePath;
			return next();
		}
	}
};
