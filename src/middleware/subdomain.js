'use strict';

module.exports = function(subdomain, middleware) {
	subdomain = subdomain || '';

	return function(req, res, next) {
		var requestedSubdomain = req.subdomains.slice().reverse().join('.');
		if (requestedSubdomain !== subdomain) { return next(); }
		middleware(req, res, next);
	};
};
