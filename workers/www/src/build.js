'use strict';

var fs = require('fs');
var path = require('path');
var through = require('through2');
var copy = require('recursive-copy');
var Handlebars = require('handlebars');

var handlebarsHelpers = require('./helpers');

var HANDLEBARS_TEMPLATE_EXTENSIONS = ['.hbs', '.handlebars'];
var STYLESHEET_EXTENSIONS = ['.css'];

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
		if (isTemplatePath(src)) {
			return processTemplate(src, dest, stats);
		} else if (isStylesheetPath(src) && !isMinifiedPath(src)) {
			return processStylesheet(src, dest, stats);
		} else {
			return null;
		}


		function processTemplate(src, dest, stats) {
			return through(function(chunk, enc, done) {
				var templateSource = chunk.toString();
				var output = renderHandlebarsTemplate(templateSource, handlebarsHelpers, context);
				done(null, output);
			});
		}


		function processStylesheet(src, dest, stats) {
			var parentPath = path.dirname(src);
			return through(function(chunk, enc, done) {
				var css = chunk.toString();
				var output = inlineSvgImages(css, parentPath);
				done(null, output);

				function inlineSvgImages(css, parentPath) {
					var RELATIVE_SVG_URL_REGEXP = /url\(['"]?(?!(?:\w+:))([^/'"].*?\.svg)['"]?\)/g;
					return css.replace(RELATIVE_SVG_URL_REGEXP, function(match, url) {
						var svgPath = path.resolve(parentPath, url);
						try {
							var svgContents = getSvgContents(svgPath);
							return 'url(\'' + getSvgDataUri(svgContents) + '\')';
						} catch (error) {
							return match;
						}
					});
				}

				function getSvgContents(filePath) {
					return fs.readFileSync(filePath, { encoding: 'utf8' });
				}

				function getSvgDataUri(svgData) {
					return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgData);
				}
			});
		}

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

	function isStylesheetPath(filePath) {
		var fileExtension = path.extname(filePath);
		var isStylesheet = (STYLESHEET_EXTENSIONS.indexOf(fileExtension) !== -1);
		return isStylesheet;
	}

	function isMinifiedPath(filePath) {
		var extension = path.extname(filePath);
		return Boolean(extension) && (path.extname(path.basename(filePath, extension)) === '.min');
	}

	function swapExtension(filePath, extension) {
		return path.join(path.dirname(filePath), path.basename(filePath, path.extname(filePath)) + extension);
	}
};
