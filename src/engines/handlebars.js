'use strict';

var handlebarsTemplateService = require('../globals/handlebarsTemplateService');

module.exports = function(templatePath, options, callback) {
	handlebarsTemplateService.render(templatePath, options)
		.then(function(output) {
			callback(null, output);
		})
		.catch(function(error) {
			callback(error);
		});
};
