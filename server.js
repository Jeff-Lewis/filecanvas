(function() {
	'use strict';

	if (process.env.NEW_RELIC_LICENSE_KEY) {
		require('newrelic');
	}

	var express = require('express');

	var config = require('./config');
	var globals = require('./app/globals');

	var stripTrailingSlash = require('./app/middleware/stripTrailingSlash');
	var customDomain = require('./app/middleware/customDomain');
	var subdomain = require('./app/middleware/subdomain');

	var port = (process.argv[2] && Number(process.argv[2])) || process.env.PORT || process.env['npm_package_config_port'] || 80;
	var debugMode = (process.env.DEBUG === 'true');


	if (!config.dropbox.appKey) { throw new Error('Missing Dropboox app key'); }
	if (!config.dropbox.appSecret) { throw new Error('Missing Dropboox app secret'); }
	if (!config.mongodb.uri) { throw new Error('Missing MongoDB connection URI'); }
	if (!config.email.from) { throw new Error('Missing email sender details'); }
	if (!config.templates['default']) { throw new Error('Missing default template name'); }

	if (!config.dropbox.appToken) {
		console.warn('No Dropbox app token specified. Generating app token...');
		generateDropboxToken(config, _handleDropboxTokenGenerated);
	} else {
		initServices(config, _handleServicesInitialized);
	}

	function _handleDropboxTokenGenerated(error, appToken) {
		if (error) { throw error; }
		console.info('Generated Dropbox app token: ' + appToken);
		config.dropbox.appToken = appToken;
		initServices(config, _handleServicesInitialized);
	}

	function _handleServicesInitialized(error) {
		if (error) { throw error; }
		initServer(port, debugMode);
	}

	function generateDropboxToken(config, callback) {
		var DropboxService = require('./app/services/DropboxService');

		var dropboxService = new DropboxService();

		dropboxService.generateAppToken({
			appKey: config.dropbox.appKey,
			appSecret: config.dropbox.appSecret
		}, _handleAppTokenGenerated);


		function _handleAppTokenGenerated(error, appToken) {
			if (error) { return callback && callback(error); }
			return callback && callback(null, appToken);
		}
	}

	function initServices(config, callback) {
		var dropboxLoaded = false;
		var mongodbLoaded = false;

		initDropbox(config, function(error, dropboxService) {
			if (error) { return callback && callback(error); }
			dropboxLoaded = true;
			globals.dropboxService = dropboxService;
			if (mongodbLoaded) { return callback && callback(null); }
		});

		initMongodb(config, function(error, dataService) {
			if (error) { return callback && callback(error); }
			mongodbLoaded = true;
			globals.dataService = dataService;
			if (dropboxLoaded) { return callback && callback(null); }
		});


		function initDropbox(config, callback) {
			var DropboxService = require('./app/services/DropboxService');

			var dropboxService = new DropboxService();

			dropboxService.connect({
				appKey: config.dropbox.appKey,
				appSecret: config.dropbox.appSecret,
				appToken: config.dropbox.appToken
			}, function(error, client) {
				if (error) {
					console.warn('Dropbox API connection error');
					return callback && callback(error);
				}
				console.info('Dropbox API connected');

				client.getAccountInfo(function(error, accountInfo) {
					if (error) { return callback && callback(error); }
					console.log('Dropbox logged in as ' + accountInfo.name);
					if (callback) { callback(null, dropboxService); }
				});

			});
		}

		function initMongodb(config, callback) {
			var DataService = require('./app/services/DataService');

			var dataService = new DataService();

			dataService.connect({
				uri: config.mongodb.uri
			}, function(error, db) {
				if (error) {
					console.warn('Mongodb connection error');
					return callback && callback(error);
				}
				console.info('Mongodb connected');

				if (callback) { callback(null, dataService); }
			});
		}
	}


	function initServer(port, debugMode) {
		var app = express();

		app.use(express.compress());
		app.use(express.json());
		app.use(express.urlencoded());
		app.use(express.methodOverride());

		var subdomainMappings = [
			{
				subdomain: 'www',
				path: '/'
			},
			{
				subdomain: 'ping',
				path: '/ping'
			},
			{
				subdomain: 'templates',
				path: '/templates'
			},
			{
				subdomain: 'admin',
				path: '/admin'
			},
			{
				subdomain: 'my',
				path: '/admin'
			},
			{
				subdomain: /([a-z0-9_\-]+)/,
				path: '/sites/$0'
			}
		];

		app.use('/', stripTrailingSlash);
		app.use('/', customDomain);
		app.use('/', subdomain({ mappings: subdomainMappings }));

		app.use('/ping', require('./app/routes/ping'));
		app.use('/templates', require('./app/routes/templates'));
		app.use('/sites', require('./app/routes/sites'));
		app.use('/admin', require('./app/routes/admin'));
		app.use('/', require('./app/routes/index'));

		if (debugMode) {

			app.use(function(err, req, res, next) {
				throw err;
			});

		} else {

			app.use(function(req, res, next) {
				res.send(404);
			});

			app.use(function(err, req, res, next) {
				res.send(err.status || 500);
			});
		}

		app.listen(port);

		console.log('Server listening on port ' + port + (debugMode ? ', debugging activated' : ''));

		return app;
	}
})();
