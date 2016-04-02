'use strict';

var assert = require('assert');

module.exports = function(subdomain, middleware) {
	subdomain = subdomain || '';

	assert(middleware, 'Missing middleware');

	return function(req, res, next) {
		var requestedSubdomain = req.subdomains.slice().reverse().join('.');
		if (requestedSubdomain !== subdomain) { return next(); }
		middleware(req, res, next);
	};
};
