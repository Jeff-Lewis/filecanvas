'use strict';

var express = require('express');
var cors = require('cors');

var invalidRoute = require('../middleware/invalidRoute');
var errorHandler = require('../middleware/errorHandler');

module.exports = function(options) {
	options = options || {};
	var themesPath = options.themesPath;

	var app = express();

	app.use(cors());

	var staticMiddleware = express.static(themesPath);
	app.use(function(req, res, next) {
		var THEME_RESOURCE_URL_REGEXP = /^\/(.+?)\/(.+)$/;
		var results = THEME_RESOURCE_URL_REGEXP.exec(req.url);
		if (!results) { return next(); }
		var themeName = results[1];
		var filePath = results[2];
		req.url = '/' + themeName + '/resources/' + filePath;
		staticMiddleware(req, res, next);
	});

	app.use(invalidRoute());
	app.use(errorHandler({
		template: 'error'
	}));

	return app;
};
