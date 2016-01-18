'use strict';

module.exports = function(options) {
	options = options || {};
	var subdomain = options.subdomain || null;
	var hostname = options.hostname || null;
	var protocol = options.protocol || 'http:';
	var port = options.port || (protocol === 'https:' ? 443 : 80);
	var path = options.path || '/';
	return protocol + '//' + (subdomain ? subdomain + '.' : '') + hostname + (port === (protocol === 'https:' ? 443 : 80) ? '' : ':' + port) + path;
};
