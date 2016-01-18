'use strict';

var url = require('url');

module.exports = function(options) {
	options = options || {};
	var protocol = options.protocol;
	var hostname = options.hostname;
	var port = options.port;
	var path = options.path || '/';

	var isDefaultPort = ((protocol === 'http:') && (port === 80)) || ((protocol === 'https:') && (port === 443));
	var host = hostname + (isDefaultPort ? '' : ':' + port);
	var pathname = path.split('?')[0];
	var search = path.substr(pathname.length) || null;
	var query = (search ? search.substr('?'.length) : null);
	var location = {
		protocol: protocol,
		slashes: true,
		host: host,
		auth: null,
		hostname: hostname,
		port: port,
		pathname: pathname,
		search: search,
		path: path,
		query: query,
		hash: null
	};
	location.href = url.format(location);
	return url.parse(location.href);
};
