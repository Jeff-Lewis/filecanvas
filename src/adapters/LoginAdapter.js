'use strict';

function LoginAdapter() {
}

LoginAdapter.prototype.adapterName = null;

LoginAdapter.prototype.middleware = function(database, passport, callback) {
	throw new Error('Not implemented');
};

LoginAdapter.prototype.authenticate = function(passportValues, userAdapterConfig) {
	return Promise.reject(new Error('Not implemented'));
};

LoginAdapter.prototype.getUserDetails = function(passportValues) {
	return Promise.reject(new Error('Not implemented'));
};

LoginAdapter.prototype.getAdapterConfig = function(passportValues, existingAdapterConfig) {
	return Promise.reject(new Error('Not implemented'));
};

module.exports = LoginAdapter;
