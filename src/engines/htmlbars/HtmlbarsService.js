'use strict';

var fs = require('fs');
var merge = require('lodash.merge');
var SimpleDom = require('simple-dom');
var DOMHelper = require('htmlbars/dist/cjs/dom-helper');
var HtmlbarsRuntime = require('htmlbars/dist/cjs/htmlbars-runtime');
var HtmlbarsCompiler = require('./lib/compiler');

// HACK: Fix safe string output in Simple DOM
// https://github.com/krisselden/morph-range/pull/7#issuecomment-145672955
DOMHelper.prototype.parseHTML = function(html) {
 return this.document.createRawHTMLSection(html);
};

var document = new SimpleDom.Document();

function HtmlbarsService(options) {
	options = options || {};
	this.helpers = options.helpers || {};
	this.hooks = options.hooks || HtmlbarsRuntime.hooks;
	this.compilerOptions = options.compiler || {};
}

HtmlbarsService.prototype.helpers = null;
HtmlbarsService.prototype.hooks = null;
HtmlbarsService.prototype.compilerOptions = null;

HtmlbarsService.prototype.compile = function(templatePath) {
	var compilerOptions = this.compilerOptions;
	return loadFile(templatePath)
		.then(function(templateSource) {
			return HtmlbarsCompiler.compile(templateSource, compilerOptions);
		});
};

HtmlbarsService.prototype.render = function(template, context, templateOptions) {
	var helpers = this.helpers;
	var hooks = this.hooks;

	// Render the Htmlbars template
	var env = merge({}, { helpers: helpers }, templateOptions, {
		dom: new DOMHelper(document),
		hooks: hooks
	});
	var result = template.render(context, env, { contextualElement: document.body });
	var outputFragment = result.fragment;

	// Serialize the emitted DOM element into an HTML string
	var serializer = new SimpleDom.HTMLSerializer(SimpleDom.voidMap);
	var html = serializer.serialize(outputFragment);
	return html;
};

HtmlbarsService.prototype.serialize = function(templatePath) {
	var compilerOptions = this.compilerOptions;
	return loadFile(templatePath)
		.then(function(templateSource) {
			return HtmlbarsCompiler.compileSpec(templateSource, compilerOptions);
		});
};

module.exports = HtmlbarsService;


function loadFile(filePath) {
	return new Promise(function(resolve, reject) {
		fs.readFile(filePath, { encoding: 'utf-8' }, function(error, data) {
			if (error) { return reject(error); }
			resolve(data);
		});
	});
}
