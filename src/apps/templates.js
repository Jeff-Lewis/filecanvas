'use strict';

var express = require('express');

var invalidRoute = require('../middleware/invalidRoute');
var errorHandler = require('../middleware/errorHandler');

module.exports = function(options) {
	options = options || {};
	var templatesPath = options.templatesPath;

	var app = express();

	app.use(express.static(templatesPath));

	app.use(invalidRoute());
	app.use(errorHandler({
		template: 'error'
	}));

	return app;
};
