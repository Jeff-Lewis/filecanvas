'use strict';

var objectAssign = require('object-assign');

module.exports = function setFormFieldValues($formElement, fieldValues) {
	var flattenedFieldValues = getFlattenedPropertyValues(fieldValues);
	updateFormValues($formElement, flattenedFieldValues);


	function getFlattenedPropertyValues(nestedValues) {
		return flattenObjectKeys(nestedValues, '');


		function flattenObjectKeys(object, keyPrefix) {
			return Object.keys(object).reduce(function(flattenedValues, key) {
				var propertyValue = object[key];
				var isNestedObject = propertyValue && (typeof propertyValue === 'object');
				if (isNestedObject) {
					var childKeyPrefix = keyPrefix + key + '.';
					objectAssign(flattenedValues, flattenObjectKeys(propertyValue, childKeyPrefix));
				} else {
					flattenedValues[keyPrefix + key] = propertyValue;
				}
				return flattenedValues;
			}, {});
		}
	}

	function updateFormValues($formElement, fieldValues) {
		var fields = getActiveFields($formElement);
		fields.filter(function(field) {
			var fieldName = field.name;
			var isHiddenField = (fieldName.charAt(0) === '_');
			return !isHiddenField;
		}).forEach(function(field) {
			var fieldName = field.name;
			var fieldElement = field.element;
			if (fieldName in fieldValues) {
				var fieldValue = fieldValues[fieldName];
				setFieldValue(fieldElement, fieldValue);
			}
		});

		function setFieldValue(element, value) {
			var isCheckboxElement = (element.tagName === 'INPUT') && ((element.type === 'checkbox') || (element.type === 'radio'));
			if (isCheckboxElement) {
				element.checked = (element.value === value);
			} else {
				element.value = value;
			}
			$(element).trigger('change');
		}

		function getActiveFields($formElement) {
			var fields = $formElement.find('input,select,textarea').get().map(function(element) {
				return {
					name: element.name,
					element: element
				};
			});
			var fieldsHash = fields.reduce(function(fieldsHash, field) {
				var fieldName = field.name;
				fieldsHash[fieldName] = field;
				return fieldsHash;
			}, {});
			var uniqueFields = Object.keys(fieldsHash).map(function(fieldName) {
				return fieldsHash[fieldName];
			});
			return uniqueFields;
		}
	}
};
