(function() {
	'use strict';

	var express = require('express');

	var config = require('./config');
	var globals = require('./app/globals');

	var port = (process.argv[2] && Number(process.argv[2])) || process.env.PORT || process.env['npm_package_config_port'] || 80;

	initServices(function(error) {
		if (error) { throw error; }
		initServer(port);
	});


	function initServices(callback) {
		var dropboxLoaded = false;
		var mongodbLoaded = false;

		initDropbox(config, function(error) {
			if (error) { return callback && callback(error); }
			dropboxLoaded = true;
			if (mongodbLoaded) { return callback && callback(null); }
		});

		initMongodb(config, function(error) {
			if (error) { return callback && callback(error); }
			mongodbLoaded = true;
			if (dropboxLoaded) { return callback && callback(null); }
		});


		function initDropbox(config, callback) {
			var DropboxService = require('./app/services/DropboxService');

			new DropboxService().connect({
				appKey: config.dropbox.appKey,
				appSecret: config.dropbox.appSecret,
				appToken: config.dropbox.appToken
			}, function(error, client) {
				if (error) {
					console.warn('Dropbox API connection error');
					return callback && callback(error);
				}
				console.info('Dropbox API connected');

				globals.dropbox = { client: client };

				client.getAccountInfo(function(error, accountInfo) {
					console.log('Dropbox logged in as ' + accountInfo.name);
					if (callback) { callback(null, DropboxService.client); }
				});

			});
		}

		function initMongodb(config, callback) {
			var DataService = require('./app/services/DataService');

			new DataService().connect({
				uri: config.mongodb.uri
			}, function(error, db) {
				if (error) {
					console.warn('Mongodb connection error');
					return callback && callback(error);
				}
				console.info('Mongodb connected');

				globals.db = db;

				if (callback) { callback(null, db); }
			});
		}
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
