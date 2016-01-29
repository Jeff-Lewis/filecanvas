'use strict';

var express = require('express');
var cors = require('cors');

var invalidRoute = require('../middleware/invalidRoute');
var errorHandler = require('../middleware/errorHandler');

module.exports = function(options) {
	options = options || {};
	var adminAssetsPath = options.adminAssetsPath;
	var errorTemplatesPath = options.errorTemplatesPath;

	if (!adminAssetsPath) { throw new Error('Missing admin assets path'); }
	if (!errorTemplatesPath) { throw new Error('Missing error templates path'); }

	var app = express();

	app.use(cors());

	app.use('/admin', express.static(adminAssetsPath, { redirect: false }));

	app.use(invalidRoute());
	app.use(errorHandler({
		templatesPath: errorTemplatesPath,
		template: 'error'
	}));

	return app;
};
