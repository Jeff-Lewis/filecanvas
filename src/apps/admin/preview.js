'use strict';

var express = require('express');

var sitesApp = require('../sites');

module.exports = function(database, options) {
	options = options || {};
	var host = options.host || null;
	var errorTemplatesPath = options.errorTemplatesPath || null;
	var themesPath = options.themesPath || null;
	var themeAssetsUrl = options.themeAssetsUrl || null;
	var adaptersConfig = options.adaptersConfig || null;

	if (!database) { throw new Error('Missing database'); }
	if (!host) { throw new Error('Missing host details'); }
	if (!themesPath) { throw new Error('Missing themes path'); }
	if (!errorTemplatesPath) { throw new Error('Missing error templates path'); }
	if (!themeAssetsUrl) { throw new Error('Missing themes root URL'); }
	if (!adaptersConfig) { throw new Error('Missing adapters configuration'); }

	var app = express();

	app.use(addUsernamePathPrefix);
	app.use(sitesApp(database, {
		preview: true,
		host: host,
		errorTemplatesPath: errorTemplatesPath,
		themesPath: themesPath,
		themeAssetsUrl: themeAssetsUrl,
		adapters: adaptersConfig
	}));

	return app;


	function addUsernamePathPrefix(req, res, next) {
		req.url = '/' + req.user.username + req.url;
		next();
	}
};
