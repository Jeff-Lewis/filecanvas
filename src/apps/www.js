'use strict';

var express = require('express');

var errorHandler = require('../middleware/errorHandler');

module.exports = function(options) {
	options = options || {};
	var sitePath = options.sitePath;

	var app = express();

	app.use(express.static(sitePath));
	app.use(errorHandler({
		template: 'error'
	}));

	return app;
};
