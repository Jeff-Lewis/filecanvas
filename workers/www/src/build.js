'use strict';

var path = require('path');
var through = require('through2');
var copy = require('recursive-copy');
var Handlebars = require('handlebars');

var handlebarsHelpers = require('./helpers');

var HANDLEBARS_TEMPLATE_EXTENSIONS = ['.hbs', '.handlebars'];

module.exports = function(source, destination, context, callback) {
	return copy(source, destination, {
		rename: rename,
		transform: transform,
		expand: true
	});


	function rename(filePath) {
		return (isTemplatePath(filePath) ? swapExtension(filePath, '.html') : filePath);
	}

	function transform(src, dest, stats) {
		if (!isTemplatePath(src)) { return null; }
		return through(function(chunk, enc, done) {
			var templateSource = chunk.toString();
			var output = renderHandlebarsTemplate(templateSource, handlebarsHelpers, context);
			done(null, output);
		});


		function renderHandlebarsTemplate(template, helpers, context) {
			var compiler = Handlebars.create();
			compiler.registerHelper(helpers);
			if (typeof template === 'string') {
				template = compiler.compile(template, {
					knownHelpers: helpers,
					knownHelpersOnly: true
				});
			}
			return template(context);
		}
	}

	function isTemplatePath(filePath) {
		var fileExtension = path.extname(filePath);
		var isTemplate = (HANDLEBARS_TEMPLATE_EXTENSIONS.indexOf(fileExtension) !== -1);
		return isTemplate;
	}

	function swapExtension(filePath, extension) {
		return path.join(path.dirname(filePath), path.basename(filePath, path.extname(filePath)) + extension);
	}
};
