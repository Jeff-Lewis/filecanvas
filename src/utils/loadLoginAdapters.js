'use strict';

var DropboxLoginAdapter = require('../adapters/DropboxAdapter').LoginAdapter;
var GoogleLoginAdapter = require('../adapters/GoogleAdapter').LoginAdapter;
var LocalLoginAdapter = require('../adapters/LocalAdapter').LoginAdapter;

module.exports = function(adaptersConfig) {
	return Object.keys(adaptersConfig).reduce(function(namedAdapters, key) {
		var adapterName = key;
		var adapterConfig = adaptersConfig[key];
		var loginAdapterConfig = adapterConfig.login;
		namedAdapters[key] = loadLoginAdapter(adapterName, loginAdapterConfig);
		return namedAdapters;
	}, {});
};


function loadLoginAdapter(adapterName, adapterConfig) {
	switch (adapterName) {
		case 'dropbox':
			return new DropboxLoginAdapter(adapterConfig);
		case 'google':
			return new GoogleLoginAdapter(adapterConfig);
		case 'local':
			return new LocalLoginAdapter(adapterConfig);
		default:
			throw new Error('Invalid adapter: ' + adapterName);
	}
}
