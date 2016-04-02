'use strict';

var assert = require('assert');

module.exports = function(options) {
	options = options || {};
	var subdomain = options.subdomain;

	assert(subdomain, 'Missing subdomain');

	return function(req, res, next) {
		var host = req.get('host');
		var currentSubdomain = req.subdomains.slice().reverse().join('.');
		if (currentSubdomain.length > 0) {
			host = host.slice((currentSubdomain + '.').length);
		}
		var redirectUrl = '//' + subdomain + '.' + host + req.url;
		res.redirect(301, redirectUrl);
	};
};
