'use strict';

var http = require('http');
var https = require('https');

module.exports = function(app, options) {
	options = options || {};
	var httpPort = options.httpPort;
	var httpTimeout = options.httpTimeout;
	var httpsPort = options.httpsPort;
	var httpsTimeout = options.httpsTimeout;
	var httpsOptions = options.httpsOptions;

	var httpServer = http.createServer(app).listen(httpPort);
	if (typeof httpTimeout === 'number') { httpServer.timeout = httpTimeout; }
	app.set('httpPort', httpPort);

	if (httpsPort) {
		var httpsServer = https.createServer(httpsOptions, app).listen(httpsPort);
		if (typeof httpsTimeout === 'number') { httpsServer.timeout = httpsTimeout; }
		app.set('httpsPort', httpsPort);
	}
};
