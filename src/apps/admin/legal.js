'use strict';

var express = require('express');

var TERMS_TEMPLATE_PATH = 'terms/terms.html';
var PRIVACY_TEMPLATE_PATH = 'privacy/privacy.html';

module.exports = function(options) {
	options = options || {};
	var templatesPath = options.templatesPath || null;

	if (!templatesPath) { throw new Error('Missing templates path'); }

	var app = express();

	initRoutes(app, templatesPath);

	return app;


	function initRoutes(app, templatesPath) {
		var routes = {
			'/terms': TERMS_TEMPLATE_PATH,
			'/privacy': PRIVACY_TEMPLATE_PATH
		};
		var staticMiddleware = express.static(templatesPath, { redirect: false });
		app.use(function(req, res, next) {
			var isLegalRoute = (req.url in routes);
			if (!isLegalRoute) {
				next();
				return;
			}
			var rewrittenUrl = routes[req.url];
			req.url = rewrittenUrl;
			staticMiddleware(req, res, next);
		});
	}
};
