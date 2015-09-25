'use strict';

module.exports = function(options) {
	options = options || {};
	var subdomain = options.subdomain || null;
	var host = options.host || null;
	var protocol = options.protocol || 'http';
	var port = options.port || (protocol === 'https' ? 443 : 80);
	return protocol + '://' + (subdomain ? subdomain + '.' : '') + host + (port === (protocol === 'https' ? 443 : 80) ? '' : ':' + port);
};
