'use strict';

var forceSsl = require('express-force-ssl');

var getIsSameHost = require('../utils/getIsSameHost');

module.exports = function(options) {
	options = options || {};
	var host = options.host;

	return function(req, res, next) {
		var isCustomDomain = !getIsSameHost(req.host, host);
		if (isCustomDomain) {
			return next();
		} else {
			forceSsl(req, res, next);
		}
	};
};
