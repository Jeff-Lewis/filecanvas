'use strict';

var express = require('express');
var cors = require('cors');

var invalidRoute = require('../middleware/invalidRoute');
var errorHandler = require('../middleware/errorHandler');

module.exports = function(options) {
	options = options || {};
	var templatesPath = options.templatesPath;

	var app = express();

	app.use(cors());

	var staticMiddleware = express.static(templatesPath);
	app.use(function(req, res, next) {
		var TEMPLATE_RESOURCE_URL_REGEXP = /^\/(.*?)\/(.*)$/;
		var results = TEMPLATE_RESOURCE_URL_REGEXP.exec(req.url);
		if (!results) { return next(); }
		var templateName = results[1];
		var filePath = results[2];
		req.url = '/' + templateName + '/resources/' + filePath;
		staticMiddleware(req, res, next);
	});

	app.use(invalidRoute());
	app.use(errorHandler({
		template: 'error'
	}));

	return app;
};
