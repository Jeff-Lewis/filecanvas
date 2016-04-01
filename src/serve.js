'use strict';

var http = require('http');
var https = require('https');

module.exports = function(app, options) {
	options = options || {};
	var httpPort = options.port;
	var httpTimeout = options.timeout || null;
	var httpsPort = options.httpsPort || null;
	var httpsOptions = options.httpsOptions || null;
	var httpsTimeout = options.httpsTimeout || httpTimeout;

	var httpServer = http.createServer(app).listen(httpPort);
	if (typeof httpTimeout === 'number') { httpServer.timeout = httpTimeout; }

	if (httpsPort) {
		var httpsServer = https.createServer(httpsOptions, app).listen(httpsPort);
		if (typeof httpsTimeout === 'number') { httpsServer.timeout = httpsTimeout; }
	}
};
