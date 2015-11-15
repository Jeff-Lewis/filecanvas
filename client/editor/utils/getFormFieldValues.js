'use strict';

module.exports = function($formElement) {
	var formFieldValues = getFormFieldValues($formElement);
	var nestedFormFieldValues = parseNestedPropertyValues(formFieldValues);
	return nestedFormFieldValues;


	function getFormFieldValues($formElement) {
		var fields = getActiveFields($formElement);
		return fields.filter(function(field) {
			var fieldName = field.name;
			var isHiddenField = (fieldName.charAt(0) === '_');
			return !isHiddenField;
		})
		.reduce(function(values, field) {
			var fieldName = field.name;
			var element = field.element;
			var fieldValue = element.value;
			values[fieldName] = fieldValue;
			return values;
		}, {});


		function getActiveFields($formElement) {
			return $formElement.find('input,select,textarea').get().filter(function(element) {
				return !getIsInputDeselected(element);
			}).map(function(element) {
				return {
					'name': element.name,
					'element': element
				};
			});


			function getIsInputDeselected(element) {
				return (element.tagName === 'INPUT') && (element.type === 'checkbox') && (element.checked === false);
			}
		}
	}

	function parseNestedPropertyValues(values) {
		return Object.keys(values).map(function(key) {
			return {
				key: key,
				value: values[key]
			};
		}).reduce(function(values, property) {
			var propertyName = property.key;
			var propertyValue = property.value;
			var propertyNameSegments = propertyName.split('.');
			propertyNameSegments.reduce(function(parent, propertyNameSegment, index, array) {
				if (index === array.length - 1) {
					parent[propertyNameSegment] = propertyValue;
					return propertyValue;
				}
				if (!(propertyNameSegment in parent)) {
					parent[propertyNameSegment] = {};
				}
				return parent[propertyNameSegment];
			}, values);
			return values;
		}, {});
	}
};
