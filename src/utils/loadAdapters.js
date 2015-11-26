'use strict';

var DropboxAdapter = require('../adapters/dropbox');
var LocalAdapter = require('../adapters/local');

module.exports = function(adaptersConfig, database) {
	return Object.keys(adaptersConfig).reduce(function(namedAdapters, key) {
		var adapterConfig = adaptersConfig[key];
		namedAdapters[key] = loadAdapter(key, database, adapterConfig);
		return namedAdapters;
	}, {});
};


function loadAdapter(adapterName, database, adapterConfig) {
	switch (adapterName) {
		case 'dropbox':
			return new DropboxAdapter(database, adapterConfig);
		case 'local':
			return new LocalAdapter(database, adapterConfig);
		default:
			throw new Error('Invalid adapter: ' + adapterName);
	}
}
