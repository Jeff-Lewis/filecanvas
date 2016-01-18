'use strict';

var path = require('path');
var express = require('express');

var pingApp = require('./ping');
var assetsApp = require('./assets');
var themesApp = require('./themes');
var demoApp = require('./demo');
var sitesApp = require('./sites');
var adminApp = require('./admin');
var wwwApp = require('./www');

var customDomain = require('../middleware/customDomain');
var subdomain = require('../middleware/subdomain');
var redirectToSubdomain = require('../middleware/redirectToSubdomain');
var stripTrailingSlash = require('../middleware/stripTrailingSlash');
var forceSsl = require('../middleware/forceSsl');
var useSubdomainAsPathPrefix = require('../middleware/useSubdomainAsPathPrefix');
var invalidRoute = require('../middleware/invalidRoute');
var errorHandler = require('../middleware/errorHandler');
var uploader = require('../middleware/uploader');
var thumbnailer = require('../middleware/thumbnailer');

var getSubdomainUrl = require('../utils/getSubdomainUrl');
var generateTempPath = require('../utils/generateTempPath');

module.exports = function(database, config) {
	config = config || {};
	var host = config.host;

	if (!host || !host.hostname) { throw new Error('Missing host name'); }

	var tempPath = generateTempPath('filecanvas');
	var thumbnailsPath = path.join(tempPath, 'thumbnails');

	var app = express();

	var templatesPath = path.resolve(__dirname, '../../templates');
	var themesPath = path.resolve(__dirname, '../../themes');

	var partialsPath = path.resolve(templatesPath, '_partials');
	var wwwTemplatesPath = path.join(templatesPath, 'www');
	var adminTemplatesPath = path.join(templatesPath, 'admin');
	var demoTemplatesPath = path.join(templatesPath, 'demo');
	var adminAssetsPath = path.join(adminTemplatesPath, 'assets');
	var legalTemplatesPath = path.join(templatesPath, 'legal');
	var faqPath = path.join(adminTemplatesPath, 'faq.json');
	var errorTemplatesPath = path.join(templatesPath, 'error');
	var siteTemplatePath = path.join(templatesPath, 'site');

	var wwwSubdomainUrl = getSubdomainUrl({
		subdomain: 'www',
		hostname: host.hostname,
		protocol: config.https.port ? 'https:' : 'http:',
		port: config.https.port || config.http.port
	});
	var assetsSubdomainUrl = getSubdomainUrl({
		subdomain: 'assets',
		hostname: host.hostname,
		protocol: config.https.port ? 'https:' : 'http:',
		port: config.https.port || config.http.port
	});
	var themesSubdomainUrl = getSubdomainUrl({
		subdomain: 'themes',
		hostname: host.hostname,
		protocol: config.https.port ? 'https:' : 'http:',
		port: config.https.port || config.http.port
	});
	var adminSubdomainUrl = getSubdomainUrl({
		subdomain: 'my',
		hostname: host.hostname,
		protocol: config.https.port ? 'https:' : 'http:',
		port: config.https.port || config.http.port
	});

	var wwwUrl = config.www.root || wwwSubdomainUrl;
	var adminUrl = config.admin.root || adminSubdomainUrl;
	var adminTemplatesUrl = adminUrl + 'templates/';
	var adminAssetsUrl = (config.assets.root || assetsSubdomainUrl) + 'admin/';
	var themeAssetsUrl = (config.assets.root || assetsSubdomainUrl) + 'themes/';
	var themesUrl = config.themes.root || themesSubdomainUrl;

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
			hostname: host.hostname,
			errorTemplatesPath: errorTemplatesPath,
			themesPath: themesPath,
			themeAssetsUrl: themeAssetsUrl,
			thumbnailsPath: path.join(thumbnailsPath, 'theme'),
			thumbnailWidth: config.themes.thumbnail.width,
			thumbnailHeight: config.themes.thumbnail.height,
			thumbnailFormat: config.themes.thumbnail.format
		}),
		'try': demoApp(database, {
			host: host,
			cookieSecret: config.session.cookieSecret,
			sessionStore: config.session.store,
			sessionDuration: config.session.duration,
			templatesPath: demoTemplatesPath,
			partialsPath: partialsPath,
			errorTemplatesPath: errorTemplatesPath,
			themesPath: themesPath,
			themeAssetsUrl: themeAssetsUrl,
			adminUrl: adminUrl,
			adminAssetsUrl: adminAssetsUrl,
			adminTemplatesUrl: adminTemplatesUrl,
			themesUrl: themesUrl,
			wwwUrl: wwwUrl,
			adapters: config.adapters,
			uploadAdapter: config.uploaders.demo
		}),
		'my': adminApp(database, {
			host: host,
			cookieSecret: config.session.cookieSecret,
			sessionStore: config.session.store,
			sessionDuration: config.session.duration,
			templatesPath: adminTemplatesPath,
			partialsPath: partialsPath,
			errorTemplatesPath: errorTemplatesPath,
			legalTemplatesPath: legalTemplatesPath,
			themesPath: themesPath,
			faqPath: faqPath,
			siteTemplatePath: siteTemplatePath,
			adminAssetsUrl: adminAssetsUrl,
			themeAssetsUrl: themeAssetsUrl,
			themesUrl: themesUrl,
			adapters: config.adapters,
			uploadAdapter: config.uploaders.admin,
			siteAuth: config.auth.site
		}),
		'sites': sitesApp(database, {
			host: host,
			cookieSecret: config.session.cookieSecret,
			sessionStore: config.session.store,
			sessionDuration: config.session.duration,
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
		var localUploadMiddleware = uploader(config.adapters.local.storage.sitesRoot, { hostname: host.hostname });
		var localDownloadMiddleware = express.static(config.adapters.local.storage.sitesRoot, { redirect: false });
		var localThumbnailMiddleware = thumbnailer(config.adapters.local.storage.sitesRoot, {
			width: config.adapters.local.storage.thumbnail.width,
			height: config.adapters.local.storage.thumbnail.height,
			format: config.adapters.local.storage.thumbnail.format,
			cache: path.join(thumbnailsPath, 'local')
		});
		subdomains[config.adapters.local.storage.upload.subdomain] = localUploadMiddleware;
		subdomains[config.adapters.local.storage.download.subdomain] = function(req, res, next) {
			res.setHeader('Content-disposition', 'attachment; filename="' + decodeURIComponent(path.basename(req.originalUrl)) + '";');
			localDownloadMiddleware(req, res, next);
		};
		subdomains[config.adapters.local.storage.preview.subdomain] = function(req, res, next) {
			res.setHeader('Content-disposition', 'inline; filename="' + decodeURIComponent(path.basename(req.originalUrl)) + '";');
			localDownloadMiddleware(req, res, next);
		};
		subdomains[config.adapters.local.storage.thumbnail.subdomain] = localThumbnailMiddleware;
	}

	initMiddleware(app, {
		host: host,
		forceHttps: Boolean(config.https.port)
	});

	initCustomDomains(app, {
		host: host
	});

	initSubdomains(app, {
		hostname: host.hostname,
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
		var forceHttps = options.forceHttps;

		app.use(stripTrailingSlash());
		app.use(express.compress());

		if (forceHttps) {
			app.set('forceSSLOptions', {
				httpsPort: host.port
			});
			app.use(forceSsl({ hostname: host.hostname }));
		}
	}

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

	function initErrorHandler(app, options) {
		options = options || {};
		var template = options.template;
		var templatesPath = options.templatesPath;

		app.use(invalidRoute());
		app.use(errorHandler({
			templatesPath: templatesPath,
			template: template
		}));
	}
};
