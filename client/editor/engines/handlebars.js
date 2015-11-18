'use strict';

var vdom = require('virtual-dom');
var virtualize = require('vdom-virtualize');
var Handlebars = require('handlebars/runtime');

var onIframeDomReady = require('../utils/onIframeDomReady');

var helpers = require('../../../src/engines/handlebars/helpers/index');

window.Handlebars = Handlebars;
window.Handlebars.templates = {};
window.Handlebars.partials = {};

module.exports = {
	throttle: 250,
	render: render
};

function render(themeId, templateId, context, previewIframeElement, callback) {
	var templateName = themeId + ':' + templateId;
	var precompiledTemplate = Handlebars.templates[templateName];
	var precompiledPartials = Object.keys(Handlebars.partials).filter(function(partialName) {
		var partialThemeId = partialName.split(':').slice(0, 2).join(':');
		return partialThemeId === themeId + ':' + templateId;
	}).reduce(function(partials, namespacedPartialName) {
		var partialName = namespacedPartialName.split(':')[2];
		partials[partialName] = Handlebars.partials[namespacedPartialName];
		return partials;
	}, {});
	var templateFunction = createHandlebarsTemplateFunction(precompiledTemplate, {
		helpers: helpers,
		partials: precompiledPartials
	});
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


	function createHandlebarsTemplateFunction(precompiledTemplate, templateOptions) {
		templateOptions = templateOptions || {};
		var helpers = templateOptions.helpers || {};
		var precompiledPartials = templateOptions.partials || {};
		var compiler = Handlebars.create();
		compiler.registerHelper(helpers);
		var partials = compilePartials(precompiledPartials, compiler);
		compiler.registerPartial(partials);
		var templateFunction = compiler.template(precompiledTemplate);
		return templateFunction;


		function compilePartials(precompiledPartials, compiler) {
			return Object.keys(precompiledPartials).reduce(function(partials, partialName) {
				var precompiledPartial = precompiledPartials[partialName];
				var partial = compiler.template(precompiledPartial);
				partials[partialName] = partial;
				return partials;
			}, {});
		}
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
