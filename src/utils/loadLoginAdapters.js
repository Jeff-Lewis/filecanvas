'use strict';

var DropboxLoginAdapter = require('../adapters/DropboxAdapter').LoginAdapter;
var GoogleLoginAdapter = require('../adapters/GoogleAdapter').LoginAdapter;
var LocalLoginAdapter = require('../adapters/LocalAdapter').LoginAdapter;

module.exports = function(adaptersConfig, database) {
	return Object.keys(adaptersConfig).reduce(function(namedAdapters, key) {
		var adapterName = key;
		var adapterConfig = adaptersConfig[key];
		var loginAdapterConfig = adapterConfig.login;
		namedAdapters[key] = loadLoginAdapter(adapterName, loginAdapterConfig, database);
		return namedAdapters;
	}, {});
};


function loadLoginAdapter(adapterName, adapterConfig, database) {
	switch (adapterName) {
		case 'dropbox':
			return new DropboxLoginAdapter(database, adapterConfig);
		case 'google':
			return new GoogleLoginAdapter(database, adapterConfig);
		case 'local':
			return new LocalLoginAdapter(database, adapterConfig);
		default:
			throw new Error('Invalid adapter: ' + adapterName);
	}
}
