'use strict';

var forceSsl = require('express-force-ssl');

var getIsSameHost = require('../utils/getIsSameHost');

module.exports = function(options) {
	options = options || {};
	var hostname = options.hostname;
	if (!hostname) { throw new Error('Missing hostname'); }

	return function(req, res, next) {
		var isCustomDomain = !getIsSameHost(req.host, hostname);
		if (isCustomDomain) {
			return next();
		} else {
			forceSsl(req, res, next);
		}
	};
};
