'use strict';

var merge = require('lodash.merge');
var DOMHelper = require('htmlbars/dist/cjs/dom-helper');
var Htmlbars = require('htmlbars/dist/cjs/htmlbars-runtime');
var wrap = require('htmlbars/dist/cjs/htmlbars-runtime/hooks').wrap;

var getIframeDomElement = require('../utils/getIframeDomElement');

var helpers = require('../../../src/engines/htmlbars/helpers/index');
var hooks = require('../../../src/engines/htmlbars/hooks/index');

window.Htmlbars = merge(Htmlbars, window.Htmlbars, {
	templates: {},
	partials: {}
});

module.exports = {
	throttle: false,
	render: render
};


function render(themeId, templateId, context, previewIframeElement, callback) {
	var templateName = themeId + ':' + templateId;
	var precompiledTemplate = Htmlbars.templates[templateName];
	var precompiledPartials = Object.keys(Htmlbars.partials).filter(function(partialName) {
		var partialThemeId = partialName.split(':').slice(0, 2).join(':');
		return partialThemeId === themeId + ':' + templateId;
	}).reduce(function(partials, namespacedPartialName) {
		var partialName = namespacedPartialName.split(':')[2];
		partials[partialName] = Htmlbars.partials[namespacedPartialName];
		return partials;
	}, {});
	var templateFunction = createHtmlbarsTemplateFunction(precompiledTemplate, {
		helpers: helpers,
		partials: precompiledPartials
	});

	var documentElement = getIframeDomElement(previewIframeElement);
	addDoctypeNode(documentElement, 'html');

	var result = templateFunction(context, documentElement);
	var outputFragment = result.fragment;

	var currentContext = context;
	var rerender = function(context) {
		if (context !== currentContext) {
			currentContext = context;
			hooks.updateSelf(result.env, result.scope, context);
		}
		result.rerender();
	};

	previewIframeElement.style.visibility = 'hidden';
	appendDocumentFragment(documentElement, outputFragment, function() {
		previewIframeElement.style.visibility = 'visible';
		callback(null, rerender);
	});


	function createHtmlbarsTemplateFunction(precompiledTemplate, templateOptions) {
		templateOptions = templateOptions || {};
		var helpers = templateOptions.helpers || {};
		var precompiledPartials = templateOptions.partials || {};
		var template = compilePrecompiledTemplate(precompiledTemplate);
		var partials = compilePartials(precompiledPartials);
		var templateFunction = function(context, targetElement) {
			var env = merge({ helpers: helpers, partials: partials }, templateOptions, {
				dom: new DOMHelper(templateOptions.dom || null),
				hooks: hooks
			});
			var renderOptions = { contextualElement: document.body };
			var result = template.render(context, env, renderOptions);
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

	function appendDocumentFragment(targetElement, outputFragment, callback) {
		var activateScripts = preventAsyncScriptLoading(outputFragment);
		for (var i = 0; i < outputFragment.childNodes.length; i++) {
			targetElement.appendChild(outputFragment.childNodes[i]);
		}
		activateScripts(callback);


		function preventAsyncScriptLoading(parentElement, callback) {
			var $scriptElements = $(parentElement).find('script');
			var reactivateScripts = $scriptElements.map(function(index, element) {
				var $scriptElement = $(element);
				if ($scriptElement.attr('src')) {
					return deactivateExternalScript($scriptElement);
				} else {
					return deactivateInlineScript($scriptElement);
				}

				function deactivateInlineScript($scriptElement) {
					var $contents = $scriptElement.contents();
					$scriptElement.empty();
					return function reactivate(callback) {
						$scriptElement.append($contents);
						callback();
					};
				}

				function deactivateExternalScript($scriptElement) {
					var src = $scriptElement.attr('src');
					var $contents = $scriptElement.contents();
					$scriptElement.removeAttr('src');
					$scriptElement.empty();
					return function reactivate(callback) {
						$scriptElement.on('load', function() {
							callback();
						});
						$scriptElement.append($contents);
						$scriptElement.attr('src', src);
					};
				}
			}).get();

			return reactivateNextScript;


			function reactivateNextScript(callback) {
				if (reactivateScripts.length === 0) { return callback(); }
				var reactivate = reactivateScripts.shift();
				reactivate(function() {
					reactivateNextScript(callback);
				});
			}
		}

	}
}
