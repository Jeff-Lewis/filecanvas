(function() {
	'use strict';

	if (process.env.NEW_RELIC_LICENSE_KEY) {
		require('newrelic');
	}

	var express = require('express');
	var passport = require('passport');

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

		_initExpress(app);
		_initPassport(app);
		_initCustomDomains(app);
		_initSubdomains(app);
		_initRoutes(app);
		_initErrorHandling(app, debugMode);

		_startServer(app, port, debugMode);

		return app;


		function _initExpress(app) {
			var sessionSecret = _generateRandomString(128);

			app.use(express.compress());
			app.use(express.cookieParser());
			app.use(express.json());
			app.use(express.urlencoded());
			app.use(express.methodOverride());
			app.use(express.session({ secret: sessionSecret }));
			
			app.use('/', stripTrailingSlash);


			function _generateRandomString(length, characters) {
				characters = characters || '!"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~';
				var string = '';
				while (string.length < length) { string += characters.charAt(Math.floor(Math.random() * characters.length)); }
				return string;
			}
		}


		function _initPassport(app) {
			app.use(passport.initialize());
			app.use(passport.session());

			passport.serializeUser(function(passportUser, callback) {
				if (!passportUser) { return callback && callback(new Error('No user specified')); }
				if (!passportUser.type) { return callback && callback(new Error('No user type specified')); }
				if (!passportUser.model) { return callback && callback(new Error('No user model specified')); }
				var userType = passportUser.type;
				var userModel = passportUser.model;
				
				var serializers = globals.passport.serializers;
				var existsSerializer = (userType in serializers);
				if (!existsSerializer) {
					return callback && callback(new Error('No serializer registered for user type "' + userType + '"'));
				}

				var serializer = serializers[userType];
				serializer(userModel, _handleUserSerialized);


				function _handleUserSerialized(error, serializedUser) {
					if (error) { return callback && callback(error); }
					var id = userType + ':' + serializedUser;
					return callback && callback(null, id);
				}
			});

			passport.deserializeUser(function(id, callback) {
				var userType = id.substr(0, id.indexOf(':'));
				var serializedUser = id.substr(id.indexOf(':') + ':'.length);

				if (!userType || !serializedUser) { return callback && callback(new Error('Invalid serialized user specified: "' + id + '"')); }
				
				var deserializers = globals.passport.deserializers;
				var existsDeserializer = (userType in deserializers);
				if (!existsDeserializer) {
					return callback && callback(new Error('No deserializer registered for user type "' + userType + '"'));
				}

				var deserializer = deserializers[userType];
				deserializer(serializedUser, _handleUserDeserialized);


				function _handleUserDeserialized(error, userModel) {
					if (error) { return callback && callback(error); }
					var passportUser = {
						type: userType,
						model: userModel
					};
					return callback && callback(null, passportUser);
				}
			});
		}

		function _initCustomDomains(app) {
			app.use('/', customDomain);
		}

		function _initSubdomains(app) {

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

			app.use('/', subdomain({ mappings: subdomainMappings }));
		}

		function _initRoutes(app) {
			app.use('/ping', require('./app/routes/ping'));
			app.use('/templates', require('./app/routes/templates'));
			app.use('/sites', require('./app/routes/sites'));
			app.use('/admin', require('./app/routes/admin'));
			app.use('/', require('./app/routes/index'));
		}

		function _initErrorHandling(app, debugMode) {
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
		}

		function _startServer(app, port, debugMode) {
			app.listen(port);
			console.info('Server listening on port ' + port + (debugMode ? ', debugging activated' : ''));
			return app;
		}
	}
})();
