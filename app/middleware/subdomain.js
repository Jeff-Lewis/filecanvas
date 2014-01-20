module.exports = (function() {
	'use strict';

	return function(options) {

		var mappings = options.mappings.map(function(mapping) {
			var pattern = (mapping.subdomain instanceof RegExp ? new RegExp('^' + mapping.subdomain.source + '$') : mapping.subdomain);
			return {
				subdomain: pattern,
				path: mapping.path
			};
		});

		return function(req, res, next) {
			var reqSubdomains = req.subdomains.slice();
			reqSubdomains.reverse();
			var subdomain = reqSubdomains.join('.');

			var matchedMapping = mappings.filter(function(mapping) {
				return (mapping.subdomain instanceof RegExp ? mapping.subdomain.test(subdomain) : mapping.subdomain === subdomain);
			})[0];

			if (!matchedMapping) { next(); }

			var pathPrefix = '';

			if (matchedMapping.subdomain instanceof RegExp) {
				var replacementString = matchedMapping.path.replace('$0', '$$&');
				pathPrefix = subdomain.replace(matchedMapping.subdomain, replacementString);
			} else {
				pathPrefix = matchedMapping.path;
			}

			req.url = pathPrefix + req.url;
			next();
		};
	};

})();
