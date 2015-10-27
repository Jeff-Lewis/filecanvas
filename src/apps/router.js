'use strict';

var path = require('path');
var express = require('express');

var pingApp = require('./ping');
var themesApp = require('./themes');
var sitesApp = require('./sites');
var adminApp = require('./admin');
var wwwApp = require('./www');

var customDomain = require('../middleware/customDomain');
var subdomain = require('../middleware/subdomain');
var redirectToSubdomain = require('../middleware/redirectToSubdomain');
var stripTrailingSlash = require('../middleware/stripTrailingSlash');
var forceSsl = require('../middleware/forceSsl');
var useSubdomainAsPathPrefix = require('../middleware/useSubdomainAsPathPrefix');
var errorHandler = require('../middleware/errorHandler');
var uploader = require('../middleware/uploader');
var thumbnailer = require('../middleware/thumbnailer');

module.exports = function(database, config) {
	var host = config.host;

	if (!host) { throw new Error('Missing host name'); }

	var app = express();

	var subdomains = {
		'ping': pingApp(),
		'www': wwwApp({
			sitePath: path.resolve(__dirname, '../../templates/www')
		}),
		'themes': themesApp({
			themesPath: path.resolve(__dirname, '../../templates/themes')
		}),
		'my': adminApp(database, {
			host: config.host,
			themesPath: path.resolve(__dirname, '../../templates/themes'),
			defaultSiteTheme: config.themes.default,
			themesUrl: config.themes.root,
			adapters: config.adapters,
			siteAuth: config.auth.site
		}),
		'sites': sitesApp(database, {
			host: config.host,
			themesUrl: config.themes.root,
			adapters: config.adapters
		}),
		'*': 'sites',
		'': redirectToSubdomain({
			subdomain: 'www'
		})
	};

	if (config.adapters.local) {
		subdomains['upload'] = uploader(config.adapters.local.root, { host: host });
		subdomains[config.adapters.local.download.subdomain] = express.static(config.adapters.local.root);
		subdomains[config.adapters.local.thumbnail.subdomain] = thumbnailer(config.adapters.local.root, {
			width: config.adapters.local.thumbnail.width,
			height: config.adapters.local.thumbnail.height,
			cache: config.adapters.local.thumbnail.cache
		});
	}

	initMiddleware(app, {
		host: config.host,
		https: Boolean(config.https.port)
	});

	initCustomDomains(app, {
		host: config.host
	});

	initSubdomains(app, {
		host: config.host,
		subdomains: subdomains
	});

	initErrorHandler(app, {
		template: 'error'
	});

	return app;


	function initMiddleware(app, options) {
		options = options || {};
		var host = options.host;
		var https = options.https;

		app.use(stripTrailingSlash());
		app.use(express.compress());

		if (https) {
			app.use(forceSsl({ host: host }));
		}
	}

	function initCustomDomains(app, options) {
		options = options || {};
		var host = options.host;

		app.use(customDomain({ host: host }));
	}

	function initSubdomains(app, options) {
		options = options || {};
		var host = options.host;
		var subdomains = options.subdomains;

		app.set('subdomain offset', host.split('.').length);

		var defaultSubdomainHandler = getSubdomainHandler('', subdomains);
		var wildcardSubdomainHandler = getSubdomainHandler('*', subdomains);
		var namedSubdomains = Object.keys(subdomains).filter(function(prefix) {
			return (prefix !== '') && (prefix !== '*');
		}).reduce(function(namedSubdomains, prefix) {
			namedSubdomains[prefix] = getSubdomainHandler(prefix, subdomains);
			return namedSubdomains;
		}, {});

		initNamedSubdomains(app, namedSubdomains);
		initDefaultSubdomain(app, defaultSubdomainHandler);
		initWildcardSubdomain(app, wildcardSubdomainHandler);


		function initNamedSubdomains(app, subdomains) {
			Object.keys(subdomains).forEach(function(prefix) {
				app.use(subdomain(prefix, subdomains[prefix]));
			});
		}

		function initDefaultSubdomain(app, middleware) {
			if (!middleware) { return; }
			app.use(subdomain(null, middleware));
		}

		function initWildcardSubdomain(app, middleware) {
			if (!middleware) { return; }
			app.use(useSubdomainAsPathPrefix());
			app.use(middleware);
		}

		function getSubdomainHandler(prefix, subdomains) {
			if (!(prefix in subdomains)) { return null; }
			var subdomainHandler = subdomains[prefix];
			var isAlias = (typeof subdomainHandler === 'string');
			if (isAlias) {
				var targetHandler = subdomains[subdomainHandler];
				subdomainHandler = targetHandler;
			}
			return subdomainHandler;
		}
	}

	function initErrorHandler(app, options) {
		options = options || {};
		var template = options.template;

		app.use(errorHandler({ template: template }));
	}
};
