'use strict';

var path = require('path');
var express = require('express');

var invalidRoute = require('../middleware/invalidRoute');
var errorHandler = require('../middleware/errorHandler');

module.exports = function(options) {
	options = options || {};
	var templatesPath = options.templatesPath;

	var app = express();

	var staticMiddleware = express.static(templatesPath);
	app.use(function(req, res, next) {
		var isHiddenFile = getIsPageTemplateFile(req.url);
		if (isHiddenFile) { return next(); }
		staticMiddleware(req, res, next);
	});

	app.use(invalidRoute());
	app.use(errorHandler({
		template: 'error'
	}));

	return app;


	function getIsPageTemplateFile(url) {
		return path.extname(url) === '.hbs';
	}
};
