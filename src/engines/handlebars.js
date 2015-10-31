'use strict';

var helpers = require('./handlebars/helpers');
var HandlebarsTemplateService = require('../services/HandlebarsTemplateService');

var templateService = new HandlebarsTemplateService({
	helpers: helpers,
	compiler: {
		strict: true,
		knownHelpersOnly: true,
		knownHelpers: helpers
	}
});

module.exports = function(templatePath, options, callback) {
	templateService.render(templatePath, options)
		.then(function(output) {
			callback(null, output);
		})
		.catch(function(error) {
			callback(error);
		});
};
