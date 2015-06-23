'use strict';

if (process.env.NEW_RELIC_LICENSE_KEY) {
	require('newrelic');
}

var Promise = require('promise');
var express = require('express');
var passport = require('passport');

var config = require('./config');
var globals = require('./app/globals');

var stripTrailingSlash = require('./app/middleware/stripTrailingSlash');
var customDomain = require('./app/middleware/customDomain');
var subdomain = require('./app/middleware/subdomain');

var port = (process.argv[2] && Number(process.argv[2])) || process.env.PORT || process.env['npm_package_config_port'] || 80;
var debugMode = (process.env.DEBUG === 'true');


if (!config.dropbox.appKey) { throw new Error('Missing Dropbox app key'); }
if (!config.dropbox.appSecret) { throw new Error('Missing Dropbox app secret'); }
if (!config.mongodb.uri) { throw new Error('Missing MongoDB connection URI'); }
if (!config.templates['default']) { throw new Error('Missing default template name'); }


loadDropboxAppToken(config)
	.then(function(appToken) {
		return initServices(config)
			.then(function(services) {
				return initServer(port, debugMode, services);
			})
			.catch(function(error) {
				throw error;
			});
	});


function loadDropboxAppToken(config) {
	if (config.dropbox.appToken) {
		return Promise.resolve(config.dropbox.appToken);
	}
	process.stderr.write('No Dropbox app token specified. Generating app token...' + '\n');
	return generateDropboxToken(config)
		.catch(function(error) {
			process.stderr.write('Failed to generate Dropbox app token' + '\n');
			throw error;
		})
		.then(function(appToken) {
			process.stdout.write('Generated Dropbox app token: ' + appToken + '\n');
			config.dropbox.appToken = appToken;
			return appToken;
		});
}

function generateDropboxToken(config) {
	var DropboxService = require('./app/services/DropboxService');

	var dropboxService = new DropboxService();

	return dropboxService.generateAppToken({
		appKey: config.dropbox.appKey,
		appSecret: config.dropbox.appSecret
	});
}

function initServices(config) {
	return Promise.all([
		initDataService(config),
		initDropboxService(config)
	]).then(function(services) {
		var dataService = services[0];
		var dropboxService = services[1];
		return {
			dataService: dataService,
			dropboxService: dropboxService
		};
	});


	function initDropboxService(config) {
		var DropboxService = require('./app/services/DropboxService');

		var dropboxService = new DropboxService();

		return dropboxService.connect({
				appKey: config.dropbox.appKey,
				appSecret: config.dropbox.appSecret,
				appToken: config.dropbox.appToken
			})
			.catch(function(error) {
				process.stderr.write('Dropbox API connection error' + '\n');
				throw error;
			})
			.then(function(client) {
				process.stdout.write('Dropbox API connected' + '\n');
				return client;
			})
			.then(function(client) {
				return new Promise(function(resolve, reject) {
						client.getAccountInfo(function(error, accountInfo) {
							if (error) { return reject(error); }
							process.stdout.write('Dropbox logged in as ' + accountInfo.name + '\n');
							return resolve(dropboxService);
						});
					})
					.catch(function(error) {
						process.stderr.write('Dropbox login failed' + '\n');
						throw error;
					});
			});
	}

	function initDataService(config) {
		var DataService = require('./app/services/DataService');

		var dataService = new DataService();

		return dataService.connect({ uri: config.mongodb.uri })
			.then(function(db) {
				process.stdout.write('Mongodb connected' + '\n');
				return dataService;
			})
			.catch(function(error) {
				process.stderr.write('Mongodb connection error' + '\n');
				throw error;
			});
	}
}


function initServer(port, debugMode, services) {
	var dataService = services.dataService;
	var dropboxService = services.dropboxService;

	var app = express();

	initExpress(app);
	initPassport(app);
	initCustomDomains(app, dataService);
	initSubdomains(app);
	initRoutes(app, dataService, dropboxService);
	initErrorHandling(app, debugMode);

	startServer(app, port, debugMode);

	return app;


	function initExpress(app) {
		var sessionSecret = generateRandomString(128);

		app.use(express.compress());
		app.use(express.cookieParser());
		app.use(express.json());
		app.use(express.urlencoded());
		app.use(express.methodOverride());
		app.use(express.session({ secret: sessionSecret }));

		app.use('/', stripTrailingSlash);


		function generateRandomString(length, characters) {
			characters = characters || '!"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~';
			var string = '';
			while (string.length < length) { string += characters.charAt(Math.floor(Math.random() * characters.length)); }
			return string;
		}
	}


	function initPassport(app) {
		app.use(passport.initialize());
		app.use(passport.session());

		passport.serializeUser(function(passportUser, callback) {
			if (!passportUser) { return callback(new Error('No user specified')); }
			if (!passportUser.type) { return callback(new Error('No user type specified')); }
			var userType = passportUser.type;

			var serializers = globals.passport.serializers;
			var existsSerializer = (userType in serializers);
			if (!existsSerializer) {
				return callback(new Error('No serializer registered for user type "' + userType + '"'));
			}

			var serializer = serializers[userType];
			serializer(passportUser, onUserSerialized);


			function onUserSerialized(error, serializedUser) {
				if (error) { return callback(error); }
				var id = userType + ':' + serializedUser;
				return callback(null, id);
			}
		});

		passport.deserializeUser(function(id, callback) {
			var userType = id.substr(0, id.indexOf(':'));
			var serializedUser = id.substr(id.indexOf(':') + ':'.length);

			if (!userType || !serializedUser) { return callback(new Error('Invalid serialized user specified: "' + id + '"')); }

			var deserializers = globals.passport.deserializers;
			var existsDeserializer = (userType in deserializers);
			if (!existsDeserializer) {
				return callback(new Error('No deserializer registered for user type "' + userType + '"'));
			}

			var deserializer = deserializers[userType];
			deserializer(serializedUser, onUserDeserialized);


			function onUserDeserialized(error, passportUser) {
				if (error) { return callback(error); }
				return callback && callback(null, passportUser);
			}
		});
	}

	function initCustomDomains(app, dataService) {
		app.use('/', customDomain(dataService));
	}

	function initSubdomains(app) {

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

	function initRoutes(app, dataService, dropboxService) {
		app.use('/ping', require('./app/routes/ping'));
		app.use('/templates', require('./app/routes/templates'));
		app.use('/sites', require('./app/routes/sites')(dataService, dropboxService));
		app.use('/admin', require('./app/routes/admin')(dataService));
		app.use('/', require('./app/routes/index'));
	}

	function initErrorHandling(app, debugMode) {
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

	function startServer(app, port, debugMode) {
		app.listen(port);
		process.stdout.write('Server listening on port ' + port + (debugMode ? ', debugging activated' : '') + '\n');
		return app;
	}
}
