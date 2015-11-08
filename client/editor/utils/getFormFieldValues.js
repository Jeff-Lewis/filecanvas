'use strict';

module.exports = function($formElement) {
	var formFieldValues = getFormFieldValues($formElement);
	var nestedFormFieldValues = parseNestedPropertyValues(formFieldValues);
	return nestedFormFieldValues;


	function getFormFieldValues($formElement) {
		var fieldElements = Array.prototype.slice.call($formElement.prop('elements'));
		return fieldElements.map(function(element) {
			var elementName = element.name;
			var elementValue = element.value;
			return {
				'key': elementName,
				'value': elementValue
			};
		})
		.filter(function(property) {
			var key = property.key;
			return (key && (key.charAt(0) !== '_'));
		})
		.reduce(function(values, property) {
			var key = property.key;
			var value = property.value;
			values[key] = value;
			return values;
		}, {});
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
