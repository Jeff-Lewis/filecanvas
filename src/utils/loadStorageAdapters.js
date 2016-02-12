'use strict';

var DropboxStorageAdapter = require('../adapters/DropboxAdapter').StorageAdapter;
var LocalStorageAdapter = require('../adapters/LocalAdapter').StorageAdapter;
var GoogleStorageAdapter = require('../adapters/GoogleAdapter').StorageAdapter;

module.exports = function(adaptersConfig, database, cache) {
	return Object.keys(adaptersConfig).reduce(function(namedAdapters, key) {
		var adapterName = key;
		var adapterConfig = adaptersConfig[key];
		var storageAdapterConfig = adapterConfig.storage;
		namedAdapters[key] = loadStorageAdapter(adapterName, storageAdapterConfig, database, cache);
		return namedAdapters;
	}, {});
};


function loadStorageAdapter(adapterName, adapterConfig, database, cache) {
	switch (adapterName) {
		case 'dropbox':
			return new DropboxStorageAdapter(database, adapterConfig);
		case 'google':
			return new GoogleStorageAdapter(database, cache, adapterConfig);
		case 'local':
			return new LocalStorageAdapter(database, adapterConfig);
		default:
			throw new Error('Invalid adapter: ' + adapterName);
	}
}
