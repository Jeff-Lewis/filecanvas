'use strict';

var fs = require('fs');
var util = require('util');

var AsyncCacheService = require('./AsyncCacheService.js');

function FileCacheService() {
	AsyncCacheService.call(this);
}

util.inherits(FileCacheService, AsyncCacheService);

FileCacheService.prototype.retrieve = function(filePath) {
	return new Promise(function(resolve, reject) {
		fs.readFile(filePath, { encoding: 'utf-8' }, function(error, data) {
			if (error) { return reject(error); }
			resolve(data);
		});
	});
};

module.exports = FileCacheService;
