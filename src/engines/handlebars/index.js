'use strict';

var memoize = require('lodash.memoize');

var constants = require('../../constants');

var helpers = require('./helpers');

var HandlebarsService = require('./HandlebarsService');

var HANDLEBARS_COMPILER_OPTIONS = constants.HANDLEBARS_COMPILER_OPTIONS;

var handlebarsService = new HandlebarsService({
	helpers: helpers,
	compiler: HANDLEBARS_COMPILER_OPTIONS
});

var compile = memoize(function(templatePath) {
	return handlebarsService.compile(templatePath);
});

var serialize = memoize(function(templatePath) {
	return handlebarsService.serialize(templatePath);
});

module.exports = function(templatePath, context, callback) {
	return compile(templatePath)
		.then(function(template) {
			// Extract the Handlebars render options from the
			// magic `_` property within the context hash
			var templateOptions = context._ || {};

			// Render the Handlebars template
			var output = handlebarsService.render(template, context, templateOptions);

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

module.exports.compile = compile;

module.exports.serialize = function(templatePath, templateId, options) {
	options = options || {};
	var isPartial = Boolean(options.partial);
	return serialize(templatePath)
		.then(function(serializedTemplate) {
			return wrapHandlebarsTemplate(serializedTemplate, {
				export: templateId,
				partial: isPartial
			});
		});


	function wrapHandlebarsTemplate(template, options) {
		options = options || {};
		var exportName = options.export;
		var isPartial = Boolean(options.partial);
		var namespace = (isPartial ? 'Handlebars.partials' : 'Handlebars.templates');
		return '(' + namespace + '=' + namespace + '||{})["' + exportName + '"]=' + template + ';';
	}
};
