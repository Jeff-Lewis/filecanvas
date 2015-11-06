'use strict';

var path = require('path');

var handlebarsEngine = require('../engines/handlebars');

module.exports = function(options) {
	options = options || {};
	var template = options.template;
	var templatesPath = options.templatesPath;
	var isProduction = process.env.NODE_ENV === 'production';

	if (!template) { throw new Error('Missing default error template'); }
	if (!templatesPath) { throw new Error('Missing templates path'); }

	return function(err, req, res, next) {
		var templatePath = path.join(templatesPath, template + '.hbs');
		var context = {
			error: err,
			debug: !isProduction
		};
		err.url = req.method + ' ' + req.protocol + '://' + req.get('host') + req.originalUrl;
		handlebarsEngine(templatePath, context, function(error, output) {
			if (error) { return next(err); }
			res.status(err.status || 500);
			res.send(output);
		});
	};
};
