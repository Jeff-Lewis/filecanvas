'use strict';

var express = require('express');

var sitesApp = require('../sites');

module.exports = function(database, cache, options) {
	options = options || {};
	var host = options.host || null;
	var themesPath = options.themesPath || null;
	var themesUrl = options.themesUrl || null;
	var adaptersConfig = options.adaptersConfig || null;
	var analyticsConfig = options.analytics || null;

	if (!database) { throw new Error('Missing database'); }
	if (!cache) { throw new Error('Missing key-value store'); }
	if (!host) { throw new Error('Missing host details'); }
	if (!themesPath) { throw new Error('Missing themes path'); }
	if (!themesUrl) { throw new Error('Missing themes root URL'); }
	if (!adaptersConfig) { throw new Error('Missing adapters configuration'); }
	if (!analyticsConfig) { throw new Error('Missing analytics configuration'); }

	var app = express();

	app.use(addUsernamePathPrefix);
	app.use(sitesApp(database, cache, {
		preview: true,
		host: host,
		themesPath: themesPath,
		themesUrl: themesUrl,
		adapters: adaptersConfig,
		analytics: analyticsConfig
	}));

	return app;


	function addUsernamePathPrefix(req, res, next) {
		req.url = '/' + req.user.username + req.url;
		next();
	}
};
