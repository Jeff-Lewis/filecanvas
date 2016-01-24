'use strict';

var url = require('url');

var Handlebars = require('handlebars');

module.exports['subdomain'] = function(options) {
	var host = options.hash.host;
	var subdomain = options.hash.subdomain || null;
	var location = Handlebars.Utils.extend({}, host, {
		hostname: (subdomain ? subdomain + '.' : '') + host.hostname,
		port: (host.port === (host.protocol === 'https:' ? 443 : 80) ? null : host.port),
		pathname: '/'
	});
	return url.format(location);
};
