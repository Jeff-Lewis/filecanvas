'use strict';

var vdom = require('virtual-dom');
var virtualize = require('vdom-virtualize');
var Handlebars = require('handlebars/runtime');

var onIframeDomReady = require('../utils/onIframeDomReady');

var helpers = require('../../../src/engines/handlebars/helpers/index');

window.Handlebars = Handlebars;
window.Handlebars.templates = {};

module.exports = {
	throttle: true,
	render: render
};

function render(templateName, context, previewIframeElement, callback) {
	var precompiledTemplate = Handlebars.templates[templateName];
	var templateFunction = createHandlebarsTemplateFunction(precompiledTemplate, helpers);
	var html = templateFunction(context);
	previewIframeElement.srcdoc = html;
	onIframeDomReady(previewIframeElement)
		.then(function(documentElement) {
			var patcher = initVirtualDomPatcher(documentElement);
			var rerender = function(context) {
				var html = templateFunction(context);
				patcher(html);
			};
			callback(null, rerender);
		});


	function createHandlebarsTemplateFunction(precompiledTemplate, helpers) {
		var compiler = Handlebars.create();
		Object.keys(helpers).forEach(function(helperName) {
			var helper = helpers[helperName];
			compiler.registerHelper(helperName, helper);
		});
		var templateFunction = compiler.template(precompiledTemplate);
		return templateFunction;
	}

	function initVirtualDomPatcher(documentElement) {
		var htmlElement = documentElement.documentElement;
		var currentTree = virtualize(htmlElement);
		return patch;


		function patch(updatedHtml) {
			var updatedTree = virtualize.fromHTML(updatedHtml);
			var diff = vdom.diff(currentTree, updatedTree);
			vdom.patch(htmlElement, diff);
			currentTree = updatedTree;
		}
	}
}
