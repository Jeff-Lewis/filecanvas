'use strict';

var url = require('url');

var Handlebars = require('handlebars');

module.exports['subdomain'] = function(options) {
	var host = options.hash.host;
	var path = options.hash.path || '/';
	var pathname = path.split('?')[0];
	var search = path.split('?')[1] || '';
	var subdomain = options.hash.subdomain || null;
	var location = Handlebars.Utils.extend({}, host, {
		hostname: (subdomain ? subdomain + '.' : '') + host.hostname,
		port: (host.port === (host.protocol === 'https:' ? 443 : 80) ? null : host.port),
		pathname: pathname,
		search: search
	});
	return url.format(location);
};
