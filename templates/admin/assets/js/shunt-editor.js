(function() {
	'use strict';

	$(function() {
		initColorpickers();
		initLivePreview();
	});


	function initColorpickers() {
		$('[data-colorpicker]').colorpicker();
	}

	function initLivePreview() {
		var $formElement = $('[data-editor-form]');
		var $previewElement = $('[data-editor-preview]');
		var previewUrl = $previewElement.prop('src');
		$formElement.on('change', onFieldChanged);


		function onFieldChanged() {
			var formFieldValues = parseFormFieldValues($formElement);
			var themeConfigOverrides = formFieldValues.theme.config;
			var updatedPreviewUrl = getPreviewUrl(previewUrl, {
				cached: true,
				config: themeConfigOverrides
			});
			$previewElement.prop('src', updatedPreviewUrl);
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
	}
})();
