'use strict';

var assert = require('assert');
var redis = require('redis');

var RedisStore = require('../stores/RedisStore');

function CacheService() {
}

CacheService.prototype.store = null;
CacheService.prototype.connectionAttempt = null;

CacheService.prototype.connect = function(url) {
	assert(url, 'Missing URL');

	if (this.store) { return Promise.resolve(this.store); }
	if (this.connectionAttempt) { return Promise.resolve(this.connectionAttempt); }

	var self = this;
	this.connectionAttempt =
		new Promise(function(resolve, reject) {
			var client = redis.createClient(url);
			var store = new RedisStore(client);
			resolve(store);
		})
		.then(function(store) {
			self.store = store;
			self.connectionAttempt = null;
			return store;
		})
		.catch(function(error) {
			self.store = null;
			self.connectionAttempt = null;
			throw error;
		});
	return this.connectionAttempt;
};

module.exports = CacheService;
