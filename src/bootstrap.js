'use strict';

var config = require('./config');

initAnalytics({ newRelic: config.newRelic });

var DatabaseService = require('./services/DatabaseService');
var routerApp = require('./apps/router');
var serve = require('./serve');
var captureErrors = require('./utils/captureErrors');

var databaseService = new DatabaseService();
databaseService.connect(config.db.url)
	.then(function(database) {
		process.stdout.write('MongoDB database connected' + '\n');
		return database;
	})
	.then(function(database) {
		return routerApp(database, config);
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
		var httpsPort = config.https.port;
		var httpsOptions = config.https;

		serve(app, {
			httpPort: httpPort,
			httpsPort: httpsPort,
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
