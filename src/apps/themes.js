'use strict';

var path = require('path');
var express = require('express');
var cors = require('cors');

var invalidRoute = require('../middleware/invalidRoute');
var errorHandler = require('../middleware/errorHandler');

module.exports = function(options) {
	options = options || {};
	var hostname = options.hostname;
	var errorTemplatesPath = options.errorTemplatesPath;
	var themesPath = options.themesPath;

	if (!hostname) { throw new Error('Missing hostname'); }
	if (!errorTemplatesPath) { throw new Error('Missing error templates path'); }
	if (!themesPath) { throw new Error('Missing themes path'); }

	var app = express();

	initCors(app);
	initStaticServer(app, themesPath);
	initErrorHandler(app, {
		templatesPath: errorTemplatesPath,
		template: 'error'
	});

	return app;


	function initCors(app) {
		app.use(cors({
			origin: new RegExp('^https?://\\w+\\.' + hostname + '(?::\\d+)?$')
		}));
	}

	function initErrorHandler(app, options) {
		options = options || {};
		var template = options.template;
		var templatesPath = options.templatesPath;

		app.use(invalidRoute());
		app.use(errorHandler({
			templatesPath: templatesPath,
			template: template
		}));
	}

	function initStaticServer(app, siteRoot) {
		app.use('/', express.static(path.resolve(siteRoot), { redirect: false }));
	}
};
