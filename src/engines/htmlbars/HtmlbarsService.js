'use strict';

var fs = require('fs');
var merge = require('lodash.merge');
var SimpleDom = require('simple-dom');
var DOMHelper = require('htmlbars/dist/cjs/dom-helper');
var HtmlbarsRuntime = require('./htmlbars-runtime');
var HtmlbarsCompiler = require('htmlbars/dist/cjs/htmlbars-compiler');

var document = new SimpleDom.Document();

function HtmlbarsService(options) {
	options = options || {};
	this.compilerOptions = options.compiler || {};
}

HtmlbarsService.prototype.compilerOptions = null;

HtmlbarsService.prototype.compile = function(templatePath) {
	var compilerOptions = this.compilerOptions;
	return loadFile(templatePath)
		.then(function(templateSource) {
			return HtmlbarsCompiler.compile(templateSource, compilerOptions);
		});
};

HtmlbarsService.prototype.render = function(template, context, templateOptions) {
	// Render the Htmlbars template
	var env = merge({}, templateOptions, {
		dom: new DOMHelper(document),
		hooks: HtmlbarsRuntime.hooks
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
