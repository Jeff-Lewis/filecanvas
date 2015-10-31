'use strict';

function AsyncCacheService(retrieveFunction) {
	this.cache = {};
	if (retrieveFunction) {
		this.retrieve = retrieveFunction;
	}
}

AsyncCacheService.prototype.cache = null;

AsyncCacheService.prototype.retrieve = function() {
	return null;
};

AsyncCacheService.prototype.get = function(key) {
	var cache = this.cache;
	var isCached = hasCachedValue(cache, key);
	if (isCached) {
		var value = getCachedValue(cache, key);
		return Promise.resolve(value);
	} else {
		var promise = this.retrieve(key)
			.then(function(value) {
				setCachedValue(cache, key, value);
				return value;
			})
			.catch(function(error) {
				deleteCachedValue(cache, key);
				throw error;
			});
		setCachedValue(cache, key, promise);
		return promise;
	}


	function hasCachedValue(cache, key) {
		return (key in cache);
	}

	function getCachedValue(cache, key) {
		return cache[key];
	}

	function setCachedValue(cache, key, value) {
		cache[key] = value;
	}

	function deleteCachedValue(cache, key, value) {
		delete cache[key];
	}
};

module.exports = AsyncCacheService;
