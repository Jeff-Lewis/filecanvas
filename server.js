'use strict';

var config = require('./config');

if (config.newRelic) { require('newrelic'); }

var DatabaseService = require('./src/services/DatabaseService');
var CacheService = require('./src/services/CacheService');

var routerApp = require('./src/apps/router');
var serve = require('./src/serve');
var captureErrors = require('./src/utils/captureErrors');

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
		captureErrors({ external: true });
		return app;
	})
	.then(function(app) {
		var port = config.http.port;
		var timeout = config.http.timeout;

		serve(app, {
			port: port,
			timeout: timeout
		});

		return app;
	})
	.then(function(app) {
		process.stdout.write('Server listening' +
			' on HTTP port ' + config.http.port +
			'\n'
		);
	})
	.catch(function(error) {
		process.nextTick(function() {
			throw error;
		});
	});
