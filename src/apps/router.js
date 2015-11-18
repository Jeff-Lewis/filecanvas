'use strict';

var path = require('path');
var express = require('express');

var pingApp = require('./ping');
var assetsApp = require('./assets');
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

var getSubdomainUrl = require('../utils/getSubdomainUrl');
var generateTempPath = require('../utils/generateTempPath');

module.exports = function(database, config) {
	var host = config.host;

	if (!host) { throw new Error('Missing host name'); }

	var tempPath = generateTempPath('shunt');
	var thumbnailsPath = path.join(tempPath, 'thumbnails');

	var app = express();

	var templatesPath = path.resolve(__dirname, '../../templates');
	var themesPath = path.resolve(__dirname, '../../themes');

	var partialsPath = path.resolve(templatesPath, '_partials');
	var wwwTemplatesPath = path.join(templatesPath, 'www');
	var adminTemplatesPath = path.join(templatesPath, 'admin');
	var adminAssetsPath = path.join(adminTemplatesPath, 'assets');
	var legalTemplatesPath = path.join(templatesPath, 'legal');
	var termsPath = path.join(legalTemplatesPath, 'terms/terms.html');
	var privacyPath = path.join(legalTemplatesPath, 'privacy/privacy.html');
	var faqPath = path.join(adminTemplatesPath, 'faq.json');
	var themesTemplatesPath = path.join(templatesPath, 'themes');
	var errorTemplatesPath = path.join(templatesPath, 'error');
	var siteTemplatePath = path.join(templatesPath, 'site');

	var assetsSubdomainUrl = getSubdomainUrl({
		subdomain: 'assets',
		host: config.host,
		protocol: config.https.port ? 'https' : 'http',
		port: config.https.port || config.http.port
	});
	var themesSubdomainUrl = getSubdomainUrl({
		subdomain: 'themes',
		host: config.host,
		protocol: config.https.port ? 'https' : 'http',
		port: config.https.port || config.http.port
	});
	var adminSubdomainUrl = getSubdomainUrl({
		subdomain: 'my',
		host: config.host,
		protocol: config.https.port ? 'https' : 'http',
		port: config.https.port || config.http.port
	});

	var adminUrl = config.assets.admin || adminSubdomainUrl;
	var createSiteUrl = adminUrl + 'sites/create-site';
	var adminTemplatesUrl = adminUrl + 'templates/';
	var adminAssetsUrl = (config.assets.root || assetsSubdomainUrl) + 'admin/';
	var themeAssetsUrl = (config.assets.root || assetsSubdomainUrl) + 'themes/';
	var themeGalleryUrl = config.themes.root || themesSubdomainUrl;

	var subdomains = {
		'ping': pingApp({
			errorTemplatesPath: errorTemplatesPath
		}),
		'www': wwwApp({
			templatesPath: wwwTemplatesPath,
			errorTemplatesPath: errorTemplatesPath
		}),
		'assets': assetsApp({
			themesPath: themesPath,
			adminAssetsPath: adminAssetsPath,
			errorTemplatesPath: errorTemplatesPath
		}),
		'themes': themesApp({
			host: config.host,
			templatesPath: themesTemplatesPath,
			partialsPath: partialsPath,
			errorTemplatesPath: errorTemplatesPath,
			themesPath: themesPath,
			themeAssetsUrl: themeAssetsUrl,
			thumbnailsPath: path.join(thumbnailsPath, 'theme'),
			thumbnailWidth: config.themes.thumbnail.width,
			thumbnailHeight: config.themes.thumbnail.height,
			thumbnailFormat: config.themes.thumbnail.format,
			adminAssetsUrl: adminAssetsUrl,
			adminTemplatesUrl: adminTemplatesUrl,
			createSiteUrl: createSiteUrl
		}),
		'my': adminApp(database, {
			host: config.host,
			templatesPath: adminTemplatesPath,
			partialsPath: partialsPath,
			errorTemplatesPath: errorTemplatesPath,
			themesPath: themesPath,
			termsPath: termsPath,
			privacyPath: privacyPath,
			faqPath: faqPath,
			siteTemplatePath: siteTemplatePath,
			adminAssetsUrl: adminAssetsUrl,
			themeAssetsUrl: themeAssetsUrl,
			themeGalleryUrl: themeGalleryUrl,
			adapters: config.adapters,
			siteAuth: config.auth.site
		}),
		'sites': sitesApp(database, {
			host: config.host,
			templatesPath: themesPath,
			errorTemplatesPath: errorTemplatesPath,
			themesPath: themesPath,
			themeAssetsUrl: themeAssetsUrl,
			adapters: config.adapters
		}),
		'*': 'sites',
		'': redirectToSubdomain({
			subdomain: 'www'
		})
	};

	if (config.adapters.local) {
		subdomains['upload'] = uploader(config.adapters.local.root, { host: host });
		subdomains[config.adapters.local.download.subdomain] = express.static(config.adapters.local.root, { redirect: false });
		subdomains[config.adapters.local.thumbnail.subdomain] = thumbnailer(config.adapters.local.root, {
			width: config.adapters.local.thumbnail.width,
			height: config.adapters.local.thumbnail.height,
			format: config.adapters.local.thumbnail.format,
			cache: path.join(thumbnailsPath, 'local')
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
		templatesPath: errorTemplatesPath,
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
		var templatesPath = options.templatesPath;

		app.use(errorHandler({
			templatesPath: templatesPath,
			template: template
		}));
	}
};
