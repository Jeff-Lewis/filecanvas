'use strict';

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
	var previewUrl = $previewElement.prop('src');
	$formElement.on('change input', debounce(onFieldChanged, 1000));


	function onFieldChanged() {
		var formFieldValues = parseFormFieldValues($formElement);
		var themeConfigOverrides = formFieldValues.theme.config;
		updatePreview(themeConfigOverrides);
	}

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

	function updatePreview(themeConfig) {
		var updatedPreviewUrl = getPreviewUrl(previewUrl, {
			cached: true,
			config: themeConfig
		});
		$previewElement.prop('src', updatedPreviewUrl);
	}

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
