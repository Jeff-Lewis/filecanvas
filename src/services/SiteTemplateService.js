'use strict';

var fs = require('fs');
var path = require('path');
var objectAssign = require('object-assign');
var isTextOrBinary = require('istextorbinary');
var template = require('es6-template-strings');
var marked = require('marked');
var pdf = require('html-pdf');

var MARKDOWN_HTML_TEMPLATE = fs.readFileSync(path.resolve(__dirname, '../../templates/markdown/index.hbs'));
var MARKDOWN_CSS_TEMPLATE = fs.readFileSync(path.resolve(__dirname, '../../node_modules/github-markdown-css/github-markdown.css'));

var constants = require('../constants');

var SITE_TEMPLATE_FILES = constants.SITE_TEMPLATE_FILES;

function SiteTemplateService() {

}

SiteTemplateService.prototype.generateSiteFiles = function(options) {
	options = options || {};
	var pathPrefix = options.pathPrefix || '';
	var context = options.context || {};

	var templateFiles = SITE_TEMPLATE_FILES;
	var flattenedTemplateFiles = flattenPathHierarchy(templateFiles, pathPrefix);
	var expandedTemplateFiles = expandPlaceholders(flattenedTemplateFiles, context);
	return convertMarkdownFiles(expandedTemplateFiles, { pdf: false });


	function flattenPathHierarchy(tree, pathPrefix) {
		var flattenedFiles = Object.keys(tree).reduce(function(flattenedFiles, filename) {
			var filePath = path.join(pathPrefix, filename);
			var fileObject = tree[filename];
			var isFile = Buffer.isBuffer(fileObject) || fileObject instanceof String;
			if (isFile) {
				flattenedFiles[filePath] = fileObject;
			} else {
				var childPaths = flattenPathHierarchy(fileObject, filePath);
				objectAssign(flattenedFiles, childPaths);
			}
			return flattenedFiles;
		}, {});
		return flattenedFiles;
	}

	function expandPlaceholders(files, context) {
		var expandedFiles = Object.keys(files).reduce(function(expandedFiles, filePath) {
			var filename = path.basename(filePath);
			var fileBuffer = files[filePath];
			var expandedFileBuffer = expandFilePlaceholders(filename, fileBuffer, context);
			expandedFiles[filePath] = expandedFileBuffer;
			return expandedFiles;
		}, {});
		return expandedFiles;


		function expandFilePlaceholders(filename, fileBuffer, context) {
			var isTextFile = getIsTextFile(filename, fileBuffer);
			if (!isTextFile) { return fileBuffer; }
			var templateString = fileBuffer.toString();
			var output = expandPlaceholderStrings(templateString, context);
			return new Buffer(output);


			function getIsTextFile(filePath, fileBuffer) {
				return isTextOrBinary.isTextSync(filePath, fileBuffer);
			}

			function expandPlaceholderStrings(source, context) {
				return template(source, context);
			}
		}
	}

	function convertMarkdownFiles(files, options) {
		options = options || {};
		var shouldCreatePdf = Boolean(options.pdf);

		var filePaths = Object.keys(files);
		return Promise.all(filePaths.map(function(filePath) {
			var filename = path.basename(filePath);
			var fileBuffer = files[filePath];
			var isMarkdownFile = getIsMarkdownFile(filename, fileBuffer);
			if (!isMarkdownFile) {
				return Promise.resolve({
					path: filePath,
					data: fileBuffer
				});
			}
			var markdownString = fileBuffer.toString();
			var html = convertMarkdownToHtml(markdownString);
			if (!shouldCreatePdf) {
				return Promise.resolve({
					path: replaceFileExtension(filePath, '.html'),
					data: new Buffer(html)
				});
			}
			return convertHtmlToPdf(html)
				.then(function(pdfBuffer) {
					return {
						path: replaceFileExtension(filePath, '.pdf'),
						data: pdfBuffer
					};
				});
		})).then(function(files) {
			var convertedFiles = files.reduce(function(convertedFiles, fileInfo) {
				var filePath = fileInfo.path;
				var fileBuffer = fileInfo.data;
				convertedFiles[filePath] = fileBuffer;
				return convertedFiles;
			}, {});
			return convertedFiles;
		});

		function getIsMarkdownFile(filename, file) {
			return (path.extname(filename) === '.md');
		}

		function convertMarkdownToHtml(markdown) {
			var markedOptions = {
				gfm: true,
				tables: true,
				breaks: true
			};
			var bodyHtml = marked(markdown, markedOptions);
			var html = template(MARKDOWN_HTML_TEMPLATE, {
				css: MARKDOWN_CSS_TEMPLATE,
				body: bodyHtml
			});
			return html;
		}

		function convertHtmlToPdf(html) {
			return new Promise(function(resolve, reject) {
				pdf.create(html).toBuffer(function(error, buffer) {
					resolve(buffer);
				});
			});
		}

		function replaceFileExtension(filePath, extension) {
			return path.join(path.dirname(filePath), path.basename(filePath, path.extname(filePath)) + extension);
		}
	}
};

module.exports = SiteTemplateService;
