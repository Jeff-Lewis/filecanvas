'use strict';

module.exports = function(configSchema) {
	return configSchema.reduce(function(defaults, configGroup) {
		var configGroupDefaults = parseConfigGroupDefaults(configGroup);
		defaults[configGroup.name] = configGroupDefaults;
		return defaults;
	}, {});


	function parseConfigGroupDefaults(configGroup) {
		var configGroupFields = configGroup.fields;
		return configGroupFields.reduce(function(defaults, field) {
			defaults[field.name] = field.default;
			return defaults;
		}, {});
	}
};
