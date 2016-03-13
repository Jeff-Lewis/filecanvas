'use strict';

module.exports = function(themeConfig, key) {
	return themeConfig.reduce(function(configValueGroups, configGroup) {
		var groupName = configGroup.name;
		var groupFields = configGroup.fields;
		var fieldValues = groupFields.reduce(function(fieldValues, configField) {
			var fieldName = configField.name;
			if (key in configField) {
				var fieldValue = configField[key];
				fieldValues[fieldName] = fieldValue;
			}
			return fieldValues;
		}, {});
		configValueGroups[groupName] = fieldValues;
		return configValueGroups;
	}, {});
};
