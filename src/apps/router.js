'use strict';

var path = require('path');
var express = require('express');

var pingApp = require('./ping');
var templatesApp = require('./templates');
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

module.exports = function(dataService, config) {
	var host = config.host;

	if (!host) { throw new Error('Missing host name'); }

	var app = express();

	initMiddleware(app);
	initCustomDomains(app, {
		host: config.host
	});
	initNamedSubdomains(app, dataService, {
		host: config.host,
		appKey: config.dropbox.appKey,
		appSecret: config.dropbox.appSecret,
		loginCallbackUrl: config.dropbox.loginCallbackUrl,
		registerCallbackUrl: config.dropbox.registerCallbackUrl,
		defaultSiteTemplate: config.templates.default
	});
	initDefaultSubdomain(app, {
		subdomain: 'www'
	});
	initWildcardSubdomain(app, {
		templatesUrl: config.templates.url
	});
	initErrorHandler(app, {
		template: 'error'
	});

	return app;


	function initMiddleware(app) {
		app.use(stripTrailingSlash());
		app.use(express.compress());
		app.use(forceSsl({ host: host }));
	}

	function initCustomDomains(app, options) {
		options = options || {};
		var host = options.host;

		app.use(customDomain({ host: host }));
	}

	function initNamedSubdomains(app, dataService, options) {
		options = options || {};
		var host = options.host;
		var appKey = options.appKey;
		var appSecret = options.appSecret;
		var loginCallbackUrl = options.loginCallbackUrl;
		var registerCallbackUrl = options.registerCallbackUrl;
		var defaultSiteTemplate = options.defaultSiteTemplate;

		app.set('subdomain offset', host.split('.').length);

		app.use(subdomain('www', wwwApp()));
		app.use(subdomain('ping', pingApp()));
		app.use(subdomain('templates', templatesApp({
			templatesPath: path.resolve(__dirname, '../../templates/sites/themes')
		})));
		app.use(subdomain('my', adminApp(dataService, {
			appKey: appKey,
			appSecret: appSecret,
			loginCallbackUrl: loginCallbackUrl,
			registerCallbackUrl: registerCallbackUrl,
			defaultSiteTemplate: defaultSiteTemplate
		})));
	}

	function initDefaultSubdomain(app, options) {
		options = options || {};
		var defaultSubdomain = options.subdomain;

		app.use(subdomain(null, redirectToSubdomain({
			subdomain: defaultSubdomain
		})));
	}

	function initWildcardSubdomain(app, options) {
		options = options || {};
		var templatesUrl = options.templatesUrl;

		app.use(useSubdomainAsPathPrefix());
		app.use(sitesApp(dataService, {
			templatesUrl: templatesUrl
		}));
	}

	function initErrorHandler(app, options) {
		options = options || {};
		var template = options.template;

		app.use(errorHandler({ template: template }));
	}
};
