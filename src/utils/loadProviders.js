'use strict';

module.exports = function(providersConfig, database) {
	return Object.keys(providersConfig).reduce(function(namedProviders, key) {
		var providerConfig = providersConfig[key];
		namedProviders[key] = loadProvider(key, database, providerConfig);
		return namedProviders;
	}, {});
};


function loadProvider(providerName, database, providerConfig) {
	var ProviderImplementation = require('../providers/' + providerName);
	return new ProviderImplementation(database, providerConfig);
}
