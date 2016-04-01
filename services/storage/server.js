'use strict';

var fs = require('fs');
var path = require('path');
var https = require('https');
var finalhandler = require('finalhandler');

var app = require('./src/app');

var port = process.env.LOCAL_PORT;
var sitesRoot = path.join(__dirname, '../..', process.env.LOCAL_SITES_ROOT);
var themeAssetsRoot = path.join(__dirname, '../..', process.env.LOCAL_THEME_ASSETS_ROOT);
var demoAssetsRoot = path.join(__dirname, '../..', process.env.LOCAL_DEMO_ASSETS_ROOT);
var httpsKey = fs.readFileSync(path.join(__dirname, '../..', process.env.LOCAL_HTTPS_KEY));
var httpsCert = fs.readFileSync(path.join(__dirname, '../..', process.env.LOCAL_HTTPS_CERT));

launchServer(app({
	sites: sitesRoot,
	themeAssets: themeAssetsRoot,
	demoAssets: demoAssetsRoot
}), {
	port: port,
	https: {
		key: httpsKey,
		cert: httpsCert
	}
})
	.then(function(server) {
		process.stdout.write('Local storage service listening on HTTPS port ' + server.address().port + '\n');
	});


function launchServer(middleware, options) {
	options = options || {};
	var port = options.port || 0;
	var httpsOptions = options.https;
	return new Promise(function(resolve, reject) {
		var server = createHttpsServer(middleware, httpsOptions);
		server.listen(port, function(error) {
			if (error) { return reject(error); }
			resolve(server);
		});
	});


	function createHttpsServer(middleware, options) {
		return https.createServer(options, function(req, res) {
			middleware(req, res, finalhandler(req, res));
		});
	}
}
