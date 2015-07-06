'use strict';

module.exports = function(requestedHost, host) {
	var requestedHostSegments = requestedHost.split('.');
	var hostSegments = host.split('.');
	return (requestedHostSegments.length >= hostSegments.length) && (requestedHostSegments.slice(-hostSegments.length).join('.') === host);
};
