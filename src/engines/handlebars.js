'use strict';

var compileHandlebarsTemplate = require('./handlebars/utils/compile');

module.exports = function(templatePath, context, callback) {
	return compileHandlebarsTemplate(templatePath)
		.then(function(templateFunction) {
			// Extract the Handlebars render options from the
			// magic `_` property within the context hash
			var templateOptions = context._ || {};

			// Render the Handlebars template
			var output = templateFunction(context, templateOptions);

			// Return the resulting string
			return output;
		})
		.then(function(output) {
			callback(null, output);
		})
		.catch(function(error) {
			callback(error);
		});
};
