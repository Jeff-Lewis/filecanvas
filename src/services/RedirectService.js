'use strict';

var assert = require('assert');
var uuid = require('uuid');

var CACHE_KEY_NAMESPACE = 'redirect:';

function RedirectService(cache) {
	assert(cache, 'Missing cache');

	this.cache = cache;
}

RedirectService.prototype.cache = null;

RedirectService.prototype.create = function(url, options) {
	options = options || {};
	var timeout = options.timeout || null;

	try {
		assert(url, 'Missing url');
	} catch (error) {
		return Promise.reject(error);
	}

	var id = uuid.v4();
	var key = CACHE_KEY_NAMESPACE + id;
	var value = url;
	return this.cache.set(key, value, { timeout: timeout })
		.then(function() {
			return id;
		});
};

RedirectService.prototype.retrieve = function(id) {
	try {
		assert(id, 'Missing id');
	} catch (error) {
		return Promise.reject(error);
	}

	var key = CACHE_KEY_NAMESPACE + id;
	return this.cache.get(key);
};

RedirectService.prototype.delete = function(id) {
	try {
		assert(id, 'Missing id');
	} catch (error) {
		return Promise.reject(error);
	}

	var key = CACHE_KEY_NAMESPACE + id;
	return this.cache.unset(key);
};

module.exports = RedirectService;
