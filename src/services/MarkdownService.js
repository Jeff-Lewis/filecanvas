'use strict';

var fs = require('fs');
var path = require('path');
var showdown = require('showdown');
var template = require('es6-template-strings');

var MARKDOWN_HTML_TEMPLATE = fs.readFileSync(path.resolve(__dirname, '../../templates/markdown/index.hbs'));
var MARKDOWN_CSS_TEMPLATE = fs.readFileSync(path.resolve(__dirname, '../../node_modules/github-markdown-css/github-markdown.css'));

function MarkdownService() {

}

MarkdownService.prototype.renderHtml = function(markdown) {
	var converter = new showdown.Converter({
		tables: true
	});
	var bodyHtml = converter.makeHtml(markdown);
	var html = template(MARKDOWN_HTML_TEMPLATE, {
		css: MARKDOWN_CSS_TEMPLATE,
		body: bodyHtml
	});
	return html;
};

module.exports = MarkdownService;
