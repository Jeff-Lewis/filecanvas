'use strict';

var memoize = require('lodash.memoize');

var constants = require('../../constants');

var helpers = require('./helpers');

var HtmlbarsService = require('./HtmlbarsService');

var HTMLBARS_COMPILER_OPTIONS = constants.HTMLBARS_COMPILER_OPTIONS;

var htmlbarsService = new HtmlbarsService({
	helpers: helpers,
	compiler: HTMLBARS_COMPILER_OPTIONS
});

var compile = memoize(function(templatePath) {
	return htmlbarsService.compile(templatePath);
});

var serialize = memoize(function(templatePath) {
	return htmlbarsService.serialize(templatePath);
});

module.exports = function(templatePath, context, callback) {
	return compile(templatePath)
		.then(function(templateFunction) {
			// Extract the Htmlbars render options from the
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

module.exports.compile = compile;
module.exports.serialize = serialize;

