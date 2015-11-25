'use strict';

var path = require('path');
var express = require('express');

var handlebarsEngine = require('../../engines/handlebars');

module.exports = function(options) {
	options = options || {};
	var templatesPath = options.templatesPath || null;
	var partialsPath = options.partialsPath || null;

	if (!templatesPath) { throw new Error('Missing templates path'); }
	if (!partialsPath) { throw new Error('Missing partials path'); }

	var app = express();

	initRoutes(app);

	return app;


	function initRoutes(app) {
		app.get('/partials/theme-options.js', retrieveThemeOptionsPartialRoute);


		function retrieveThemeOptionsPartialRoute(req, res, next) {
			new Promise(function(resolve, reject) {
				var templatePath = path.join(partialsPath, 'theme-options.hbs');
				var templateName = 'theme-options';
				var templateOptions = {};
				resolve(
					handlebarsEngine.serialize(templatePath, templateName, templateOptions)
						.then(function(serializedTemplate) {
							sendPrecompiledTemplate(res, serializedTemplate);
						})
				);
			})
			.catch(function(error) {
				return next(error);
			});
		}

		function sendPrecompiledTemplate(res, template) {
			res.set('Content-Type', 'text/javscript');
			res.send(template);
		}
	}
};
