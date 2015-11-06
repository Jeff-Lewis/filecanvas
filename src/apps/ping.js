'use strict';

var express = require('express');

var invalidRoute = require('../middleware/invalidRoute');
var errorHandler = require('../middleware/errorHandler');

module.exports = function(options) {
	options = options || {};
	var errorTemplatesPath = options.errorTemplatesPath || null;

	if (!errorTemplatesPath) { throw new Error('Missing error templates path'); }

	var app = express();

	app.get('/', function(req, res) {
		res.send(204);
	});

	app.use(invalidRoute());
	app.use(errorHandler({
		templatesPath: errorTemplatesPath,
		template: 'error'
	}));

	return app;
};
