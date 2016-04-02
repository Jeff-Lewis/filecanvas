'use strict';

var assert = require('assert');
var express = require('express');

var sitesApp = require('../sites');

module.exports = function(database, cache, options) {
	options = options || {};
	var host = options.host || null;
	var themesPath = options.themesPath || null;
	var themesUrl = options.themesUrl || null;
	var themeAssetsUrl = options.themeAssetsUrl || null;
	var adaptersConfig = options.adaptersConfig || null;
	var analyticsConfig = options.analytics || null;

	assert(database, 'Missing database');
	assert(cache, 'Missing key-value store');
	assert(host, 'Missing host details');
	assert(themesPath, 'Missing themes path');
	assert(themesUrl, 'Missing themes root URL');
	assert(themeAssetsUrl, 'Missing theme assets root URL');
	assert(adaptersConfig, 'Missing adapters configuration');
	assert(analyticsConfig, 'Missing analytics configuration');

	var app = express();

	app.use(addUsernamePathPrefix);

	app.use(sitesApp(database, cache, {
		preview: true,
		host: host,
		themesPath: themesPath,
		themesUrl: themesUrl,
		themeAssetsUrl: themeAssetsUrl,
		adapters: adaptersConfig,
		analytics: analyticsConfig
	}));

	return app;


	function addUsernamePathPrefix(req, res, next) {
		req.url = '/' + req.user.username + req.url;
		next();
	}
};
