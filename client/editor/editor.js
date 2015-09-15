'use strict';

var vdom = require('virtual-dom');
var virtualize = require('vdom-virtualize');

var LIVE_UPDATE_DEBOUNCE_DURATION = 1000;

$(function() {
	initColorpickers();
	initLivePreview();
});


function initColorpickers() {
	var isChanging = false;
	$('[data-colorpicker]').colorpicker().on('changeColor.colorpicker', function(event) {
		if (isChanging) { return; }
		var $colorPickerElement = $(this);
		var $inputElement = $colorPickerElement.data('colorpicker').input;
		isChanging = true;
		$inputElement.change();
		isChanging = false;
	});
}

function initLivePreview() {
	var $formElement = $('[data-editor-form]');
	var $previewElement = $('[data-editor-preview]');
	var iframeSrc = $previewElement.prop('src');
	var previewUrl = getPreviewUrl(iframeSrc, {
		cached: true
	});
	var patchIframeContent = null;
	$formElement.on('change input', debounce(onFieldChanged, LIVE_UPDATE_DEBOUNCE_DURATION));

	$previewElement.hide().on('load', function() {
		loadHtml(previewUrl)
			.then(function(html) {
				var iframeDocumentElement = getIframeDomElement($previewElement[0]);
				patchIframeContent = createDocumentPatcher(iframeDocumentElement, html);
				$previewElement.show();
			});
	});


	function getPreviewUrl(previewUrl, params) {
		var baseUrl = previewUrl.split('#')[0].split('?')[0];
		return baseUrl + '?' + serializeQueryParams(params);


		function serializeQueryParams(params) {
			return Object.keys(params).map(function(key) {
				var value = params[key];
				return key + '=' + encodeURIComponent(JSON.stringify(value));
			}).join('&');
		}
	}

	function onFieldChanged() {
		var formFieldValues = parseFormFieldValues($formElement);
		var themeConfigOverrides = formFieldValues.theme.config;
		updatePreview(themeConfigOverrides);


		function parseFormFieldValues($formElement) {
			var fieldElements = Array.prototype.slice.call($formElement.prop('elements'));
			var fieldValues = fieldElements.map(function(element) {
				var elementName = element.name;
				var elementValue = element.value;
				return {
					'name': elementName,
					'value': elementValue
				};
			}).filter(function(field) {
				return Boolean(field.name) && (field.name.indexOf('theme.config.') === 0);
			}).reduce(function(values, field) {
				var fieldName = field.name;
				var fieldValue = field.value;
				var fieldNameSegments = fieldName.split('.');
				fieldNameSegments.reduce(function(parent, fieldNameSegment, index, array) {
					if (index === array.length - 1) {
						parent[fieldNameSegment] = fieldValue;
						return fieldValue;
					}
					if (!(fieldNameSegment in parent)) {
						parent[fieldNameSegment] = {};
					}
					return parent[fieldNameSegment];
				}, values);
				return values;
			}, {});
			return fieldValues;
		}
	}

	function updatePreview(themeConfig) {
		var updatedPreviewUrl = getPreviewUrl(previewUrl, {
			cached: true,
			config: themeConfig
		});
		var supportsLiveDomPatching = Boolean(patchIframeContent);
		if (!supportsLiveDomPatching) {
			$previewElement.prop('src', updatedPreviewUrl);
			return;
		}
		loadHtml(updatedPreviewUrl)
			.then(function(html) {
				patchIframeContent(html);
			});
	}

	function loadHtml(url) {
		return $.ajax(url)
			.then(function(data, textStatus, jqXHR) {
				return new $.Deferred().resolve(data).promise();
			})
			.fail(function(jqXHR, textStatus, errorThrown) {
				return new $.Deferred().reject(new Error(errorThrown)).promise();
			});
	}

	function getIframeDomElement(iframeElement) {
		return (iframeElement.contentDocument || iframeElement.contentWindow.document);
	}

	function createDocumentPatcher(documentElement, html) {
		var htmlElement = documentElement.documentElement;
		var tree = parseHtmlIntoVDom(html);
		return patch;


		function patch(html) {
			tree = patchElementHtml(htmlElement, tree, html);
		}

		function patchElementHtml(element, tree, updatedHtml) {
			var updatedTree = parseHtmlIntoVDom(updatedHtml);
			var patch = vdom.diff(tree, updatedTree);
			vdom.patch(element, patch);
			return updatedTree;
		}

		function parseHtmlIntoVDom(html) {
			var iframeElement = document.createElement('iframe');
			iframeElement.style.display = 'none';
			document.body.appendChild(iframeElement);
			var documentElement = iframeElement.contentDocument || iframeElement.contentWindow.document;
			documentElement.open();
			documentElement.write(html);
			documentElement.close();
			var htmlElement = documentElement.documentElement;
			var tree = virtualize(htmlElement);
			document.body.removeChild(iframeElement);
			return tree;
		}
	}

	function debounce(func, wait, immediate) {
		var timeout;
		return function() {
			var context = this, args = arguments;
			var later = function() {
				timeout = null;
				if (!immediate) { func.apply(context, args); }
			};
			var callNow = immediate && !timeout;
			clearTimeout(timeout);
			timeout = setTimeout(later, wait);
			if (callNow) { func.apply(context, args); }
		};
	}
}
