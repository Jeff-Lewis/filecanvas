'use strict';

var config = require('./config');

initAnalytics({ newRelic: config.newRelic });

var DatabaseService = require('./services/DatabaseService');
var CacheService = require('./services/CacheService');

var routerApp = require('./apps/router');
var serve = require('./serve');
var captureErrors = require('./utils/captureErrors');

var databaseService = new DatabaseService();
var cacheService = new CacheService();
Promise.all([
	databaseService.connect(config.db.url),
	cacheService.connect(config.cache.url)
])
	.then(function(connections) {
		process.stdout.write('MongoDB database connected' + '\n');
		process.stdout.write('Redis cache connected' + '\n');
		return connections;
	})
	.then(function(connections) {
		var database = connections[0];
		var cache = connections[1];
		return routerApp(database, cache, config);
	})
	.then(function(app) {
		process.stdout.write('Express app initialized' + '\n');
		return app;
	})
	.then(function(app) {
		captureErrors();
		return app;
	})
	.then(function(app) {
		var httpPort = config.http.port;
		var httpTimeout = config.http.timeout;
		var httpsPort = config.https.port;
		var httpsTimeout = config.https.timeout;
		var httpsOptions = config.https;

		serve(app, {
			httpPort: httpPort,
			httpTimeout: httpTimeout,
			httpsPort: httpsPort,
			httpsTimeout: httpsTimeout,
			httpsOptions: httpsOptions
		});

		return app;
	})
	.then(function(app) {
		process.stdout.write('Server listening' +
			' on HTTP port ' + app.get('httpPort') +
			(app.get('httpsPort') ? ', HTTPS port ' + app.get('httpsPort') : '') +
			'\n'
		);
	})
	.catch(function(error) {
		process.nextTick(function() {
			throw error;
		});
	});


function initAnalytics(options) {
	options = options || {};
	var newRelic = options.newRelic;

	if (newRelic) {
		require('newrelic');
	}
}
