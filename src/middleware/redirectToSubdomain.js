'use strict';

module.exports = function(options) {
	options = options || {};
	var subdomain = options.subdomain;

	return function(req, res, next) {
		var redirectUrl = '//' + subdomain + '.' + req.get('host') + req.url;
		res.redirect(301, redirectUrl);
	};
};
