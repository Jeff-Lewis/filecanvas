'use strict';

var fs = require('fs');
var path = require('path');
var stream = require('stream');
var copy = require('recursive-copy');
var Handlebars = require('handlebars');
var objectAssign = require('object-assign');
var frontMatter = require('front-matter');

var handlebarsHelpers = require('./helpers');

var HANDLEBARS_TEMPLATE_EXTENSIONS = ['.hbs', '.handlebars'];
var MARKDOWN_TEMPLATE_EXTENSIONS = ['.md', '.markdown'];
var STYLESHEET_EXTENSIONS = ['.css'];

var HANDLEBARS_PARTIALS_DIRECTORY_NAME = '_partials';
var HANDLEBARS_TEMPLATES_DIRECTORY_NAME = '_templates';

module.exports = function(source, destination, context, callback) {
	var handlebarsPartialsPath = path.resolve(source, HANDLEBARS_PARTIALS_DIRECTORY_NAME);
	var handlebarsTemplatesPath = path.resolve(source, HANDLEBARS_TEMPLATES_DIRECTORY_NAME);
	var handlebarsOptions = {
		helpers: handlebarsHelpers,
		partials: loadHandlebarsTemplates(handlebarsPartialsPath, {
			helpers: handlebarsHelpers
		})
	};
	var handlebarsTemplates = loadHandlebarsTemplates(handlebarsTemplatesPath, handlebarsOptions);

	return copy(source, destination, {
		rename: rename,
		transform: transform,
		filter: [
			'**/*',
			'!_*',
			'!_*/**/*'
		],
		expand: true
	});


	function loadHandlebarsTemplates(templatesDir, handlebarsOptions) {
		return fs.readdirSync(templatesDir)
			.filter(function(filename) {
				return isTemplatePath(filename);
			})
			.reduce(function(templates, filename) {
				var templateId = path.basename(filename, path.extname(filename));
				var templatePath = path.join(templatesDir, filename);
				var templateSource = fs.readFileSync(templatePath, { encoding: 'utf8' });
				var templateTemplate = compileHandlebarsTemplate(templateSource, handlebarsOptions);
				templates[templateId] = templateTemplate;
				return templates;
			}, {});
	}

	function rename(filePath) {
		return (isTemplatePath(filePath) || isMarkdownPath(filePath) ? swapExtension(filePath, '.html') : filePath);
	}

	function transform(src, dest, stats) {
		if (isTemplatePath(src)) {
			return createTemplateTransformStream(src, dest, stats);
		} else if (isMarkdownPath(src)) {
			return createMarkdownTransformStream(src, dest, stats);
		} else if (isStylesheetPath(src) && !isMinifiedPath(src)) {
			return createStylesheetTransformStream(src, dest, stats);
		} else {
			return null;
		}


		function createTemplateTransformStream(src, dest, stats) {
			return createAtomicTextTransformStream(function(source) {
				return renderHandlebarsTemplate(source, context, handlebarsOptions);
			});
		}

		function createMarkdownTransformStream(src, dest, stats) {
			var markdownTemplate = handlebarsTemplates['markdown'];
			return createAtomicTextTransformStream(function(markdown) {
				var article = frontMatter(markdown);
				var templateData = {
					title: article.attributes.title,
					content: article.body
				};
				return renderHandlebarsTemplate(markdownTemplate, objectAssign(templateData, context), handlebarsOptions);
			});
		}

		function createStylesheetTransformStream(src, dest, stats) {
			var parentPath = path.dirname(src);
			return createAtomicTextTransformStream(function(css) {
				return inlineSvgImages(css, parentPath);
			});


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
		}

		function createAtomicTextTransformStream(transformFn) {
			var buffer = '';
			return new stream.Transform({
				encoding: 'utf8',
				transform: function(chunk, enc, done) {
					buffer += chunk.toString();
					done();
				},
				flush: function(done) {
					var output = transformFn(buffer);
					this.push(output);
					done();
				}
			});
		}
	}

	function isTemplatePath(filePath) {
		var fileExtension = path.extname(filePath);
		var isTemplate = (HANDLEBARS_TEMPLATE_EXTENSIONS.indexOf(fileExtension) !== -1);
		return isTemplate;
	}

	function isMarkdownPath(filePath) {
		var fileExtension = path.extname(filePath);
		var isTemplate = (MARKDOWN_TEMPLATE_EXTENSIONS.indexOf(fileExtension) !== -1);
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

	function compileHandlebarsTemplate(source, options) {
		options = options || {};
		var helpers = options.helpers || {};
		var partials = options.partials || {};
		var compiler = Handlebars.create();
		compiler.registerHelper(helpers);
		compiler.registerPartial(partials);
		var template = compiler.compile(source, {
			knownHelpers: helpers,
			knownHelpersOnly: true
		});
		return template;
	}

	function renderHandlebarsTemplate(template, context, options) {
		if (typeof template === 'string') {
			template = compileHandlebarsTemplate(template, options);
		}
		return template(context);
	}
};
