'use strict';

var path = require('path');
var express = require('express');
var cors = require('cors');

var invalidRoute = require('../middleware/invalidRoute');

module.exports = function(options) {
	options = options || {};
	var hostname = options.hostname;
	var themesPath = options.themesPath;

	if (!hostname) { throw new Error('Missing hostname'); }
	if (!themesPath) { throw new Error('Missing themes path'); }

	var app = express();

	initCors(app);
	initStaticServer(app, themesPath);
	initErrorHandler(app);

	return app;


	function initErrorHandler(app) {
		app.use(invalidRoute());
	}

	function initCors(app) {
		app.use(cors({
			origin: new RegExp('^https?://\\w+\\.' + hostname + '(?::\\d+)?$')
		}));
	}

	function initStaticServer(app, siteRoot) {
		app.use('/', express.static(path.resolve(siteRoot), { redirect: false }));
	}
};
