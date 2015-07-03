'use strict';

var http = require('http');
var https = require('https');
var express = require('express');
var forceSsl = require('express-force-ssl');
var passport = require('passport');
var methodOverride = require('method-override');

var HttpError = require('./app/errors/HttpError');

var handlebarsEngine = require('./app/engines/handlebars');

var stripTrailingSlash = require('./app/middleware/stripTrailingSlash');
var customDomain = require('./app/middleware/customDomain');
var subdomain = require('./app/middleware/subdomain');
var errorPage = require('./app/middleware/errorPage');

var config = require('./config');
var globals = require('./app/globals');

if (config.newRelic) {
	require('newrelic');
}

var isProduction = (process.env.NODE_ENV === 'production');

if (!config.dropbox.appKey) { throw new Error('Missing Dropbox app key'); }
if (!config.dropbox.appSecret) { throw new Error('Missing Dropbox app secret'); }
if (!config.db.uri) { throw new Error('Missing MongoDB connection URI'); }
if (!config.templates.default) { throw new Error('Missing default template name'); }

run();


function run() {
	initDataService(config)
		.then(function(dataService) {
			var httpPort = config.http.port;
			var httpsPort = config.https.port;
			var httpsOptions = config.https;
			var app = initApp(dataService, httpPort, httpsPort, isProduction);
			initServer(app, httpPort, httpsPort, httpsOptions);
			process.stdout.write('Server listening' +
				' on HTTP port ' + httpPort +
				(httpsPort ? ', HTTPS port ' + httpsPort : '') +
				'\n'
			);
			return app;
		})
		.catch(function(error) {
			throw error;
		});
}


function initDataService(config) {
	var DataService = require('./app/services/DataService');

	var dataService = new DataService();

	var mongodbUri = config.db.uri;
	return dataService.connect(mongodbUri)
		.then(function(db) {
			process.stdout.write('Mongodb connected' + '\n');
			return dataService;
		})
		.catch(function(error) {
			process.stderr.write('Mongodb connection error' + '\n');
			throw error;
		});
}

function initApp(dataService, httpPort, httpsPort, isProduction) {
	var app = express();

	initExpress(app, httpPort, httpsPort);
	initPassport(app);
	initCustomDomains(app, dataService);
	initSubdomains(app);
	initViewEngine(app);
	initRoutes(app, dataService);
	initErrorHandling(app, isProduction);

	return app;


	function initExpress(app, httpPort, httpsPort) {
		var sessionSecret = generateRandomString(128);

		app.set('httpPort', httpPort);

		if (httpsPort) {
			app.set('httpsPort', httpsPort);
			app.use(forceSsl);
		}

		app.use(express.compress());
		app.use(express.cookieParser());
		app.use(express.json());
		app.use(express.urlencoded());
		app.use(methodOverride(function(req, res) {
			if (req.body && req.body._method) {
				var method = req.body._method;
				delete req.body._method;
				return method;
			}
		}));
		app.use(methodOverride('X-HTTP-Method-Override'));
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

	function initViewEngine(app) {
		app.engine('hbs', handlebarsEngine);
		app.set('views', './templates');
		app.set('view engine', 'hbs');
	}

	function initRoutes(app, dataService, dropboxService) {
		app.use('/ping', require('./app/routes/ping'));
		app.use('/templates', require('./app/routes/templates'));
		app.use('/sites', require('./app/routes/sites')(dataService));
		app.use('/admin', require('./app/routes/admin')(dataService));
		app.use('/', require('./app/routes/index'));
	}

	function initErrorHandling(app, isProduction) {
		var isDebuggerAttached = (process.execArgv.indexOf('--debug') !== -1);
		if (isDebuggerAttached) {
			app.use(function(req, res, next) {
				next(new HttpError(404, req.url));
			});
		} else {
			app.use(function(req, res, next) {
				next(new HttpError(404));
			});
		}
		app.use(errorPage({
			template: 'error/error'
		}));
	}
}

function initServer(app, httpPort, httpsPort, httpsOptions) {
	http.createServer(app).listen(httpPort);
	if (httpsPort) {
		https.createServer(httpsOptions, app).listen(httpsPort);
	}
}
