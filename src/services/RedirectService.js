'use strict';

var uuid = require('uuid');

var CACHE_KEY_NAMESPACE = 'redirect:';

function RedirectService(cache) {
	this.cache = cache;
}

RedirectService.prototype.cache = null;

RedirectService.prototype.create = function(url, options) {
	options = options || {};
	var timeout = options.timeout || null;

	var id = uuid.v4();
	var key = CACHE_KEY_NAMESPACE + id;
	var value = url;
	return this.cache.set(key, value, { timeout: timeout })
		.then(function() {
			return id;
		});
};

RedirectService.prototype.retrieve = function(id) {
	var key = CACHE_KEY_NAMESPACE + id;
	return this.cache.get(key);
};

RedirectService.prototype.delete = function(id) {
	var key = CACHE_KEY_NAMESPACE + id;
	return this.cache.unset(key);
};

module.exports = RedirectService;
