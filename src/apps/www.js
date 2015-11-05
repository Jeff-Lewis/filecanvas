'use strict';

var express = require('express');

var invalidRoute = require('../middleware/invalidRoute');
var errorHandler = require('../middleware/errorHandler');

module.exports = function(options) {
	options = options || {};
	var templatesPath = options.templatesPath;
	var errorTemplatesPath = options.errorTemplatesPath;

	if (!templatesPath) { throw new Error('Missing templates path'); }
	if (!errorTemplatesPath) { throw new Error('Missing error templates path'); }

	var app = express();

	app.use(express.static(templatesPath));
	app.use(invalidRoute());
	app.use(errorHandler({
		templatesPath: errorTemplatesPath,
		template: 'error'
	}));

	return app;
};
