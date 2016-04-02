'use strict';

var assert = require('assert');
var fs = require('fs');
var express = require('express');

var handlebarsEngine = require('../../engines/handlebars');

var AdminPageService = require('../../services/AdminPageService');

var DEFAULT_USERNAME = 'your-username';
var DEFAULT_SITE_NAME = 'my-canvas';

module.exports = function(options) {
	options = options || {};
	var templatesPath = options.templatesPath || null;
	var partialsPath = options.partialsPath || null;
	var faqPath = options.faqPath || null;
	var sessionMiddleware = options.sessionMiddleware || null;
	var analyticsConfig = options.analytics || null;

	assert(templatesPath, 'Missing templates path');
	assert(partialsPath, 'Missing partials path');
	assert(faqPath, 'Missing FAQ data path');
	assert(sessionMiddleware, 'Missing session middleware');
	assert(analyticsConfig, 'Missing analytics configuration');

	var adminPageService = new AdminPageService({
		templatesPath: templatesPath,
		partialsPath: partialsPath,
		sessionMiddleware: sessionMiddleware,
		analytics: analyticsConfig
	});

	var faqData = JSON.parse(fs.readFileSync(faqPath, { encoding: 'utf8' }));

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
		app.get('/', retrieveFaqRoute);


		function retrieveFaqRoute(req, res, next) {
			var username = req.user.username || DEFAULT_USERNAME;
			var siteModels = res.locals.sites || [];

			new Promise(function(resolve, reject) {
				var siteName = (siteModels.length > 0 ? getRandomArrayItem(siteModels).name : DEFAULT_SITE_NAME);
				var faqs = replaceFaqPlaceholders(faqData, {
					username: username,
					sitename: siteName
				});
				var templateData = {
					content: {
						questions: faqs
					}
				};
				return resolve(
					adminPageService.render(req, res, {
						template: 'faq',
						context: templateData
					})
				);
			})
			.catch(function(error) {
				next(error);
			});


			function replaceFaqPlaceholders(faqData, options) {
				var username = options.username;
				var sitename = options.sitename;
				return JSON.parse(JSON.stringify(faqData)
					.replace(/\$\{username\}/g, username)
					.replace(/\$\{sitename\}/g, sitename)
				);
			}

			function getRandomArrayItem(items) {
				return items[Math.floor(Math.random() * items.length)];
			}
		}
	}
};
