'use strict';

var assert = require('assert');
var path = require('path');
var express = require('express');
var merge = require('lodash.merge');

var statusApp = require('./status');
var demoApp = require('./demo');
var sitesApp = require('./sites');
var adminApp = require('./admin');

var customDomain = require('../middleware/customDomain');
var subdomain = require('../middleware/subdomain');
var redirectToSubdomain = require('../middleware/redirectToSubdomain');
var useSubdomainAsPathPrefix = require('../middleware/useSubdomainAsPathPrefix');
var invalidRoute = require('../middleware/invalidRoute');
var errorHandler = require('../middleware/errorHandler');

var getSubdomainUrl = require('../utils/getSubdomainUrl');
var stripTrailingSlash = require('../utils/stripTrailingSlash');

module.exports = function(database, cache, config) {
	config = config || {};
	var host = config.host;

	assert(host && host.hostname, 'Missing host name');

	var wwwUrl = config.www.url || getSubdomainUrl('www', { host: host });
	var adminUrl = config.admin.url || getSubdomainUrl('my', { host: host });
	var themesUrl = config.themes.url || getSubdomainUrl('themes', { host: host });
	var assetsUrl = config.assets.url || getSubdomainUrl('assets', { host: host });
	var adminTemplatesUrl = adminUrl + 'templates/';
	var adminAssetsUrl = assetsUrl + 'admin/';
	var themeAssetsUrl = assetsUrl + 'theme/';

	if (config.adapters.dropbox) {
		config.adapters.dropbox = getDropboxAdapterConfig(config.adapters.dropbox, {
			adminUrl: adminUrl
		});
	}

	if (config.adapters.google) {
		config.adapters.google = getGoogleAdapterConfig(config.adapters.google, {
			adminUrl: adminUrl
		});
	}

	var appTemplatesPath = config.templates.app;
	var siteTemplatePath = config.templates.site;
	var themesPath = config.themes.root;

	var partialsPath = path.resolve(appTemplatesPath, '_partials');
	var adminTemplatesPath = path.join(appTemplatesPath, 'admin');
	var demoTemplatesPath = path.join(appTemplatesPath, 'demo');
	var faqPath = path.join(appTemplatesPath, 'faq/faq.json');

	var app = express();

	app.use('/status', statusApp());

	var subdomains = {
		'status': statusApp(),
		'try': demoApp(database, cache, {
			host: host,
			cookieSecret: config.session.cookieSecret,
			sessionStore: config.session.store,
			sessionDuration: config.session.duration,
			templatesPath: demoTemplatesPath,
			partialsPath: partialsPath,
			themesPath: themesPath,
			adminUrl: adminUrl,
			adminAssetsUrl: adminAssetsUrl,
			adminTemplatesUrl: adminTemplatesUrl,
			themesUrl: themesUrl,
			themeAssetsUrl: themeAssetsUrl,
			wwwUrl: wwwUrl,
			uploadAdapter: config.uploaders.demo,
			analytics: config.analytics.demo
		}),
		'my': adminApp(database, cache, {
			host: host,
			cookieSecret: config.session.cookieSecret,
			sessionStore: config.session.store,
			sessionDuration: config.session.duration,
			templatesPath: adminTemplatesPath,
			partialsPath: partialsPath,
			themesPath: themesPath,
			faqPath: faqPath,
			siteTemplatePath: siteTemplatePath,
			adminAssetsUrl: adminAssetsUrl,
			themesUrl: themesUrl,
			themeAssetsUrl: themeAssetsUrl,
			wwwUrl: wwwUrl,
			adapters: config.adapters,
			uploadAdapter: config.uploaders.admin,
			siteAuth: config.auth.site,
			analytics: config.analytics.admin
		}),
		'sites': sitesApp(database, cache, {
			host: host,
			cookieSecret: config.session.cookieSecret,
			sessionStore: config.session.store,
			sessionDuration: config.session.duration,
			themesPath: themesPath,
			themesUrl: themesUrl,
			themeAssetsUrl: themeAssetsUrl,
			adapters: config.adapters,
			analytics: config.analytics.sites
		}),
		'*': 'sites',
		'': redirectToSubdomain({
			subdomain: 'www'
		})
	};

	initCustomDomains(app, {
		host: host
	});

	initSubdomains(app, {
		hostname: host.hostname,
		subdomains: subdomains
	});

	initErrorHandler(app);

	return app;


	function initCustomDomains(app, options) {
		options = options || {};
		var host = options.host;
		var hostname = host.hostname;

		app.use(customDomain({ hostname: hostname }));
	}

	function initSubdomains(app, options) {
		options = options || {};
		var hostname = options.hostname;
		var subdomains = options.subdomains;

		app.set('subdomain offset', hostname.split('.').length);

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

	function initErrorHandler(app) {
		app.use(invalidRoute());
		app.use(errorHandler());
	}
};

function getDropboxAdapterConfig(adapterConfig, options) {
	options = options || {};
	var adminUrl = options.adminUrl;
	var oauthCallbackPath = '/login/dropbox/oauth2/callback';
	return merge({}, adapterConfig, {
		login: {
			loginCallbackUrl: adapterConfig.login.loginCallbackUrl || (stripTrailingSlash(adminUrl) + oauthCallbackPath)
		}
	});
}

function getGoogleAdapterConfig(adapterConfig, options) {
	options = options || {};
	var adminUrl = options.adminUrl;
	var oauthCallbackPath = '/login/google/oauth2/callback';
	return merge({}, adapterConfig, {
		login: {
			loginCallbackUrl: adapterConfig.login.loginCallbackUrl || (stripTrailingSlash(adminUrl) + oauthCallbackPath)
		}
	});
}
