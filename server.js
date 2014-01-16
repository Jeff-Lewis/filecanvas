(function() {
	'use strict';

	var express = require('express');
	var config = require('./config');

	var port = (process.argv[2] && Number(process.argv[2])) || process.env.PORT || process.env['npm_package_config_port'] || 80;

	var dropboxLoaded = false;
	var mongodbLoaded = false;

	initDropbox(config, function(error) {
		if (error) { throw error; }
		dropboxLoaded = true;
		if (mongodbLoaded) { initServer(port); }
	});

	initMongodb(config, function(error) {
		if (error) { throw error; }
		mongodbLoaded = true;
		if (dropboxLoaded) { initServer(port); }
	});


	function initDropbox(config, callback) {
		var DropboxService = require('./app/services/DropboxService');

		DropboxService.connect({
			appKey: config.dropbox.appKey,
			appSecret: config.dropbox.appSecret,
			appToken: config.dropbox.appToken
		}, function(error, client) {
			if (error) {
				console.warn('Dropbox API connection error');
				if (callback) { return callback(error); }
				throw error;
			}
			console.info('Dropbox API connected');

			DropboxService.client.getAccountInfo(function(error, accountInfo) {
				console.log('Dropbox logged in as ' + accountInfo.name);
				if (callback) { callback(null, DropboxService.client); }
			});

		});
	}

	function initMongodb(config, callback) {
		var DataService = require('./app/services/DataService');

		DataService.connect({
			uri: config.mongodb.uri
		}, function(error, db) {
			if (error) {
				console.warn('Mongodb connection error');
				if (callback) { return callback(error); }
				throw error;
			}
			console.info('Mongodb connected');
			if (callback) { callback(null, db); }
		});
	}

	function initServer(port) {
		var app = express();

		app.use(express.compress());

		app.use('/templates/', require('./app/routes/templates'));
		app.use('/user', require('./app/routes/user'));
		app.use('/', require('./app/routes/index'));

		app.listen(port);

		console.log('Server listening on port ' + port);
	}
})();
