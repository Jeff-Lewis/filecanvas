'use strict';

var express = require('express');

var handlebarsEngine = require('../../engines/handlebars');

var AdminPageService = require('../../services/AdminPageService');

module.exports = function(options) {
	options = options || {};
	var templatesPath = options.templatesPath || null;
	var partialsPath = options.partialsPath || null;
	var sessionMiddleware = options.sessionMiddleware || null;

	if (!templatesPath) { throw new Error('Missing templates path'); }
	if (!partialsPath) { throw new Error('Missing partials path'); }
	if (!sessionMiddleware) { throw new Error('Missing session middleware'); }

	var adminPageService = new AdminPageService({
		templatesPath: templatesPath,
		partialsPath: partialsPath
	});

	var app = express();

	initRoutes(app, sessionMiddleware);
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

	function initRoutes(app, sessionMiddleware) {
		app.get('/', sessionMiddleware, retrieveSupportRoute);


		function retrieveSupportRoute(req, res, next) {
			new Promise(function(resolve, reject) {
				var templateData = {
					content: null
				};
				return resolve(
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
