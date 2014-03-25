module.exports = (function() {
	'use strict';

	var REGEXP_TRAILING_SLASH = /\/+$/;
	return function(req, res, next) {
		var hasTrailingSlash = (req.url !== '/') && REGEXP_TRAILING_SLASH.test(req.url);
		if (hasTrailingSlash) {
			res.redirect(301, req.url.replace(REGEXP_TRAILING_SLASH, ''));
			return;
		}
		next();
	};
})();
