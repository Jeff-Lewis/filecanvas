'use strict';

var dns = require('dns');

module.exports = function(host) {
	return function(req, res, next) {
		var hostname = getTopLevelHostname(req);
		var isCustomDomain = hostname !== host;
		if (isCustomDomain) {
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
		} else {
			next();
		}


		function getTopLevelHostname(req) {
			return req.host.split('.').slice(req.subdomains.length).join('.');
		}
	};
};
