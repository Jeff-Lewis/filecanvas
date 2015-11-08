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
		.then(function(template) {
			// Extract the Htmlbars render options from the
			// magic `_` property within the context hash
			var templateOptions = context._ || {};

			// Render the Handlebars template
			var html = htmlbarsService.render(template, context, templateOptions);

			// HTMLBars doesn't parse doctype nodes, so we need to prepend one
			var doctype = '<!DOCTYPE html>';
			html = doctype + '\n' + html;

			// Return the resulting string
			return html;
		})
		.then(function(output) {
			callback(null, output);
		})
		.catch(function(error) {
			callback(error);
		});
};

module.exports.compile = compile;
module.exports.serialize = function(templatePath, templateId) {
	return serialize(templatePath)
		.then(function(serializedTemplate) {
			return wrapHtmlbarsTemplate(serializedTemplate, templateId);
		});


	function wrapHtmlbarsTemplate(template, exportName) {
		return '(Htmlbars.templates=Htmlbars.templates||{})["' + exportName + '"]=' + template + ';';
	}
};

