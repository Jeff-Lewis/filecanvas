'use strict';

var assert = require('assert');

function RedisStore(client) {
	assert(client, 'Missing Redis client');

	this.client = client;
}

RedisStore.prototype.client = null;

RedisStore.prototype.get = function(key) {
	try {
		assert(key, 'Missing key');
	} catch (error) {
		return Promise.reject(error);
	}

	var client = this.client;
	return new Promise(function(resolve, reject) {
		client.get(key, function(error, value) {
			if (error) { return reject(error); }
			resolve();
		});
	});
};

RedisStore.prototype.set = function(key, value, options) {
	var timeout = options.timeout || null;

	try {
		assert(key, 'Missing key');
		assert(typeof value !== 'undefined', 'Missing value');
	} catch (error) {
		return Promise.reject(error);
	}

	var client = this.client;
	return new Promise(function(resolve, reject) {
		if (timeout) {
			client.setex(key, timeout, value, function(error, response) {
				if (error) { return reject(error); }
				resolve();
			});
		} else {
			client.set(key, value, function(error, response) {
				if (error) { return reject(error); }
				resolve();
			});
		}
	});
};

RedisStore.prototype.unset = function(key) {
	try {
		assert(key, 'Missing key');
	} catch (error) {
		return Promise.reject(error);
	}

	var client = this.client;
	return new Promise(function(resolve, reject) {
		client.del(key, function(error, value) {
			if (error) { return reject(error); }
			resolve();
		});
	});
};

module.exports = RedisStore;
