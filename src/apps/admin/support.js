'use strict';

var assert = require('assert');
var express = require('express');

var handlebarsEngine = require('../../engines/handlebars');

var AdminPageService = require('../../services/AdminPageService');

module.exports = function(options) {
	options = options || {};
	var templatesPath = options.templatesPath || null;
	var partialsPath = options.partialsPath || null;
	var sessionMiddleware = options.sessionMiddleware || null;
	var analyticsConfig = options.analytics || null;

	assert(templatesPath, 'Missing templates path');
	assert(partialsPath, 'Missing partials path');
	assert(sessionMiddleware, 'Missing session middleware');
	assert(analyticsConfig, 'Missing analytics configuration');

	var adminPageService = new AdminPageService({
		templatesPath: templatesPath,
		partialsPath: partialsPath,
		sessionMiddleware: sessionMiddleware,
		analytics: analyticsConfig
	});

	var app = express();

	initRoutes(app);
	initViewEngine(app, {
		templatesPath: templatesPath
	});

	return app;


	function initViewEngine(app, options) {
		options = options || {};
		var templatesPath = options.templatesPath;

		app.engine('hbs', handlebarsEngine);
		app.set('views', templatesPath);
		app.set('view engine', 'hbs');
	}

	function initRoutes(app) {
		app.get('/', retrieveSupportRoute);


		function retrieveSupportRoute(req, res, next) {
			new Promise(function(resolve, reject) {
				var templateData = {
					content: null
				};
				resolve(
					adminPageService.render(req, res, {
						template: 'support',
						context: templateData
					})
				);
			})
			.catch(function(error) {
				next(error);
			});
		}
	}
};
