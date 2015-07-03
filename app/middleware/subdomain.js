'use strict';

var express = require('express');
var tld = require('tldjs');

module.exports = function(options) {
	var mappings = options.mappings.map(function(mapping) {
		var pattern = (mapping.subdomain instanceof RegExp ? new RegExp('^' + mapping.subdomain.source + '$') : mapping.subdomain);
		return {
			subdomain: pattern,
			path: mapping.path
		};
	});

	var app = express();

	app.use(function(req, res, next) {
		var isLocalHost = (req.host.split('.').pop() === 'localhost');
		if (isLocalHost) {
			app.set('subdomain offset', 1);
		} else {
			var baseUrl = tld.getDomain(req.host);
			var subdomainOffset = baseUrl.split('.').length;
			app.set('subdomain offset', subdomainOffset);
		}
		next();
	});

	app.use(function(req, res, next) {
		var reqSubdomains = req.subdomains.slice();
		reqSubdomains.reverse();
		var subdomain = reqSubdomains.join('.');

		var matchedMapping = mappings.filter(function(mapping) {
			return (mapping.subdomain instanceof RegExp ? mapping.subdomain.test(subdomain) : mapping.subdomain === subdomain);
		})[0];

		if (!matchedMapping) {
			next();
			return;
		}

		var pathPrefix = '';

		if (matchedMapping.subdomain instanceof RegExp) {
			var replacementString = matchedMapping.path.replace('$0', '$$&');
			pathPrefix = subdomain.replace(matchedMapping.subdomain, replacementString);
		} else {
			pathPrefix = matchedMapping.path;
		}

		pathPrefix = pathPrefix || '';
		if (pathPrefix.charAt(0) !== '/') { pathPrefix = '/' + pathPrefix; }

		var requestedPath = req.url;

		if (pathPrefix === '/') { pathPrefix = ''; }
		if (requestedPath === '/') { requestedPath = ''; }

		var updatedUrl = (pathPrefix + requestedPath) || '/';

		req.url = updatedUrl;
		next();
	});

	return app;
};
