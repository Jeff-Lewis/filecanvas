'use strict';

var merge = require('lodash.merge');
var DOMHelper = require('htmlbars/dist/cjs/dom-helper');
var Htmlbars = require('htmlbars/dist/cjs/htmlbars-runtime');
var wrap = require('htmlbars/dist/cjs/htmlbars-runtime/hooks').wrap;

var getIframeDomElement = require('../utils/getIframeDomElement');

var helpers = require('../../../src/engines/htmlbars/helpers/index');

window.Htmlbars = Htmlbars;
window.Htmlbars.templates = {};
window.Htmlbars.partials = {};

module.exports = {
	throttle: false,
	render: render
};


function render(templateName, context, previewIframeElement, callback) {
	var precompiledTemplate = Htmlbars.templates[templateName];
	var precompiledPartials = Htmlbars.partials;
	var templateFunction = createHtmlbarsTemplateFunction(precompiledTemplate, {
		helpers: helpers,
		partials: precompiledPartials
	});
	var documentElement = getIframeDomElement(previewIframeElement);
	addDoctypeNode(documentElement, 'html');
	var result = templateFunction(context, documentElement);
	var currentContext = context;
	var rerender = function(context) {
		if (context !== currentContext) {
			currentContext = context;
			Htmlbars.hooks.updateSelf(result.env, result.scope, context);
		}
		result.rerender();
	};
	callback(null, rerender);


	function createHtmlbarsTemplateFunction(precompiledTemplate, templateOptions) {
		templateOptions = templateOptions || {};
		var helpers = templateOptions.helpers || {};
		var precompiledPartials = templateOptions.partials || {};
		var template = compilePrecompiledTemplate(precompiledTemplate);
		var partials = compilePartials(precompiledPartials);
		var templateFunction = function(context, targetElement) {
			var env = merge({ helpers: helpers, partials: partials }, templateOptions, {
				dom: new DOMHelper(templateOptions.dom || null),
				hooks: Htmlbars.hooks
			});
			var renderOptions = { contextualElement: document.body };
			var result = template.render(context, env, renderOptions);
			var outputFragment = result.fragment;
			for (var i = 0; i < outputFragment.childNodes.length; i++) {
				targetElement.appendChild(outputFragment.childNodes[i]);
			}
			return result;
		};
		return templateFunction;


		function compilePartials(precompiledPartials) {
			return Object.keys(precompiledPartials).reduce(function(partials, partialName) {
				var precompiledPartial = precompiledPartials[partialName];
				var partial = compilePrecompiledTemplate(precompiledPartial);
				partials[partialName] = partial;
				return partials;
			}, {});
		}

		function compilePrecompiledTemplate(precompiledTemplate) {
			return wrap(precompiledTemplate, Htmlbars.render);
		}
	}

	function addDoctypeNode(documentElement, qualifiedNameStr, publicId, systemId) {
		publicId = publicId || '';
		systemId = systemId || '';
		try {
			var doctypeNode = document.implementation.createDocumentType(qualifiedNameStr, publicId, systemId);
			documentElement.appendChild(doctypeNode);
		} catch (error) {
			return;
		}
	}
}
