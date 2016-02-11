'use strict';

function RedisStore(client) {
	this.client = client;
}

RedisStore.prototype.client = null;

RedisStore.prototype.get = function(key) {
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
	var client = this.client;
	return new Promise(function(resolve, reject) {
		client.del(key, function(error, value) {
			if (error) { return reject(error); }
			resolve();
		});
	});
};

module.exports = RedisStore;
