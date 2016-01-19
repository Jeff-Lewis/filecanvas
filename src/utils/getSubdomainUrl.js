'use strict';

module.exports = function(subdomain, options) {
	options = options || {};
	var host = options.host;
	var path = options.path || '/';
	var hostname = host.hostname || null;
	var protocol = host.protocol || 'http:';
	var port = host.port || (protocol === 'https:' ? 443 : 80);
	return protocol + '//' + (subdomain ? subdomain + '.' : '') + hostname + (port === (protocol === 'https:' ? 443 : 80) ? '' : ':' + port) + path;
};
