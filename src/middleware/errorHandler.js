'use strict';

var path = require('path');

var handlebarsEngine = require('../engines/handlebars');

module.exports = function(options) {
	options = options || {};
	var template = options.template;
	var templatesPath = path.resolve(__dirname, '../../templates/error');

	return function(err, req, res, next) {
		var templatePath = path.join(templatesPath, template + '.hbs');
		var context = {
			error: err
		};
		err.url = req.method + ' ' + req.protocol + '://' + req.get('host') + req.originalUrl;
		handlebarsEngine(templatePath, context, function(error, output) {
			if (error) { return next(err); }
			res.status(err.status || 500);
			res.send(output);
		});
	};
};
