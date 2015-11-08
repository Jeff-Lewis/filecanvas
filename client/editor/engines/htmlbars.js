'use strict';

var merge = require('lodash.merge');
var DOMHelper = require('htmlbars/dist/cjs/dom-helper');
var Htmlbars = require('htmlbars/dist/cjs/htmlbars-runtime');

var getIframeDomElement = require('../utils/getIframeDomElement');

var helpers = require('../../../src/engines/htmlbars/helpers/index');

window.Htmlbars = Htmlbars;
window.Htmlbars.templates = {};

module.exports = {
	throttle: false,
	render: render
};


function render(templateName, context, previewIframeElement, callback) {
	var documentElement = getIframeDomElement(previewIframeElement);
	addDoctypeNode(documentElement, 'html');
	var template = Htmlbars.templates[templateName];
	var templateOptions = {
		helpers: helpers
	};
	var rerender = renderHtmlbarsTemplate(template, context, templateOptions, documentElement);
	callback(null, rerender);


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

	function renderHtmlbarsTemplate(template, context, templateOptions, targetElement) {
		var result = renderHtmlbarsTemplate(template, context, templateOptions);
		var outputFragment = result.fragment;
		for (var i = 0; i < outputFragment.childNodes.length; i++) {
			targetElement.appendChild(outputFragment.childNodes[i]);
		}

		var currentContext = context;
		return function(context) {
			if (context !== currentContext) {
				currentContext = context;
				updateHtmlbarsTemplateContext(result, context);
			}
			result.rerender();
		};

		function updateHtmlbarsTemplateContext(result, context) {
			Htmlbars.hooks.updateSelf(result.env, result.scope, context);
		}

		function renderHtmlbarsTemplate(templateFunction, context, templateOptions) {
			var env = merge(templateOptions, {
				dom: new DOMHelper(templateOptions.dom || null),
				hooks: Htmlbars.hooks
			});
			var scope = Htmlbars.hooks.createFreshScope();
			Htmlbars.hooks.bindSelf(env, scope, context);
			var renderOptions = {};
			var result = Htmlbars.render(templateFunction, env, scope, renderOptions);
			return result;
		}
	}
}
