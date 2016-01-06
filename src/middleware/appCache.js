'use strict';

module.exports = function(options) {
	options = options || {};
	var manifestPath = options.manifest;

	return function(req, res, next) {
		res.setHeader('Content-Type', 'text/cache-manifest');
		res.sendfile(manifestPath);
	};
};
