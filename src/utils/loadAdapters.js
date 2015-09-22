'use strict';

module.exports = function(adaptersConfig, database) {
	return Object.keys(adaptersConfig).reduce(function(namedAdapters, key) {
		var adapterConfig = adaptersConfig[key];
		namedAdapters[key] = loadAdapter(key, database, adapterConfig);
		return namedAdapters;
	}, {});
};


function loadAdapter(adapterName, database, adapterConfig) {
	var AdapterImplementation = require('../adapters/' + adapterName);
	return new AdapterImplementation(database, adapterConfig);
}
