'use strict';

var dns = require('dns');

var getIsSameHost = require('../utils/getIsSameHost');

module.exports = function(options) {
	options = options || {};
	var host = options.host;

	return function(req, res, next) {
		var isCustomDomain = !getIsSameHost(req.host, host);
		if (!isCustomDomain) {
			return next();
		}
		dns.resolveCname(req.host, function(error, cnames) {
			if (error) { return next(error); }
			if (!cnames || (cnames.length === 0)) {
				return next();
			}
			var cname = cnames[0];
			res.locals.originalHost = req.host;
			req.headers.host = cname;
			next();
		});
	};
};
