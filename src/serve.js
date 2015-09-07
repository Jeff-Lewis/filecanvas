'use strict';

var http = require('http');
var https = require('https');

module.exports = function(app, options) {
	options = options || {};
	var httpPort = options.httpPort;
	var httpsPort = options.httpsPort;
	var httpsOptions = options.httpsOptions;

	http.createServer(app).listen(httpPort);
	app.set('httpPort', httpPort);

	if (httpsPort) {
		https.createServer(httpsOptions, app).listen(httpsPort);
		app.set('httpsPort', httpsPort);
		app.set('forceSSLOptions', {
			httpsPort: httpsPort
		});
	}
};
