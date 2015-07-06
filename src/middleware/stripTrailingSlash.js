'use strict';

var REGEXP_TRAILING_SLASH = /\/+$/;

module.exports = function() {
	return function(req, res, next) {
		var hasTrailingSlash = (req.url !== '/') && REGEXP_TRAILING_SLASH.test(req.url);
		if (!hasTrailingSlash) { return next(); }
		res.redirect(301, req.url.replace(REGEXP_TRAILING_SLASH, ''));
	};
};
