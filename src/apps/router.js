'use strict';

var path = require('path');
var express = require('express');
var merge = require('lodash.merge');

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

module.exports = function(database, cache, config) {
	config = config || {};
	var host = config.host;

	if (!host || !host.hostname) { throw new Error('Missing host name'); }

	var wwwSubdomainUrl = getSubdomainUrl('www', { host: host });
	var assetsSubdomainUrl = getSubdomainUrl('assets', { host: host });
	var themesSubdomainUrl = getSubdomainUrl('themes', { host: host });
	var adminSubdomainUrl = getSubdomainUrl('my', { host: host });
	var demoSubdomainUrl = getSubdomainUrl('try', { host: host });

	var wwwUrl = config.www.url || wwwSubdomainUrl;
	var adminUrl = config.admin.url || adminSubdomainUrl;
	var demoUrl = config.demo.url || demoSubdomainUrl;
	var themesUrl = config.themes.url || themesSubdomainUrl;
	var assetsUrl = config.assets.url || assetsSubdomainUrl;
	var adminTemplatesUrl = adminUrl + 'templates/';
	var adminAssetsUrl = assetsUrl + 'admin/';

	if (config.adapters.local) {
		config.adapters.local = getLocalAdapterConfig(config.adapters.local, { host: host });
	}
	if (config.uploaders.admin.adapter === 'local') {
		config.uploaders.admin = getLocalUploaderConfig(config.uploaders.admin, { host: host });
	}
	if (config.uploaders.demo.adapter === 'local') {
		config.uploaders.demo = getLocalUploaderConfig(config.uploaders.demo, { host: host });
	}

	if (config.adapters.dropbox) {
		config.adapters.dropbox = getDropboxAdapterConfig(config.adapters.dropbox, {
			adminUrl: adminUrl,
			demoUrl: demoUrl
		});
	}

	if (config.adapters.google) {
		config.adapters.google = getGoogleAdapterConfig(config.adapters.google, {
			adminUrl: adminUrl,
			demoUrl: demoUrl
		});
	}

	var templatesPath = path.resolve(__dirname, '../../templates');
	var themesPath = config.themes.root;
	var wwwSiteRoot = config.www.siteRoot;

	var tempPath = generateTempPath('filecanvas');

	var partialsPath = path.resolve(templatesPath, '_partials');
	var adminTemplatesPath = path.join(templatesPath, 'admin');
	var demoTemplatesPath = path.join(templatesPath, 'demo');
	var adminAssetsPath = path.join(adminTemplatesPath, 'assets');
	var faqPath = path.join(adminTemplatesPath, 'faq.json');
	var errorTemplatesPath = path.join(templatesPath, 'error');
	var siteTemplatePath = path.join(templatesPath, 'site');
	var thumbnailsPath = path.join(tempPath, 'thumbnails');

	var app = express();

	var subdomains = {
		'ping': pingApp({
			errorTemplatesPath: errorTemplatesPath
		}),
		'www': wwwApp({
			siteRoot: wwwSiteRoot,
			errorTemplatesPath: errorTemplatesPath
		}),
		'assets': assetsApp({
			adminAssetsPath: adminAssetsPath,
			errorTemplatesPath: errorTemplatesPath
		}),
		'themes': themesApp({
			hostname: host.hostname,
			errorTemplatesPath: errorTemplatesPath,
			themesPath: themesPath
		}),
		'try': demoApp(database, cache, {
			host: host,
			cookieSecret: config.session.cookieSecret,
			sessionStore: config.session.store,
			sessionDuration: config.session.duration,
			templatesPath: demoTemplatesPath,
			partialsPath: partialsPath,
			errorTemplatesPath: errorTemplatesPath,
			themesPath: themesPath,
			adminUrl: adminUrl,
			adminAssetsUrl: adminAssetsUrl,
			adminTemplatesUrl: adminTemplatesUrl,
			themesUrl: themesUrl,
			wwwUrl: wwwUrl,
			adapters: config.adapters,
			uploadAdapter: config.uploaders.demo
		}),
		'my': adminApp(database, cache, {
			host: host,
			cookieSecret: config.session.cookieSecret,
			sessionStore: config.session.store,
			sessionDuration: config.session.duration,
			templatesPath: adminTemplatesPath,
			partialsPath: partialsPath,
			errorTemplatesPath: errorTemplatesPath,
			themesPath: themesPath,
			faqPath: faqPath,
			siteTemplatePath: siteTemplatePath,
			adminAssetsUrl: adminAssetsUrl,
			themesUrl: themesUrl,
			wwwUrl: wwwUrl,
			adapters: config.adapters,
			uploadAdapter: config.uploaders.admin,
			siteAuth: config.auth.site
		}),
		'sites': sitesApp(database, cache, {
			host: host,
			cookieSecret: config.session.cookieSecret,
			sessionStore: config.session.store,
			sessionDuration: config.session.duration,
			errorTemplatesPath: errorTemplatesPath,
			themesPath: themesPath,
			themesUrl: themesUrl,
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
	if (config.uploaders.admin.adapter === 'local') {
		var siteAssetUploadMiddleware = uploader(config.uploaders.admin.assetRoot, { hostname: host.hostname });
		var siteAssetDownloadMiddleware = express.static(config.uploaders.admin.assetRoot, { redirect: false });
		subdomains[config.uploaders.admin.uploadSubdomain] = siteAssetUploadMiddleware;
		subdomains[config.uploaders.admin.downloadSubdomain] = siteAssetDownloadMiddleware;
	}
	if (config.uploaders.demo.adapter === 'local') {
		var demoAssetUploadMiddleware = uploader(config.uploaders.demo.assetRoot, { hostname: host.hostname });
		var demoAssetDownloadMiddleware = express.static(config.uploaders.demo.assetRoot, { redirect: false });
		subdomains[config.uploaders.demo.uploadSubdomain] = demoAssetUploadMiddleware;
		subdomains[config.uploaders.demo.downloadSubdomain] = demoAssetDownloadMiddleware;
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


function getLocalAdapterConfig(adapterConfig, options) {
	options = options || {};
	var host = options.host;
	return merge({}, adapterConfig, {
		storage: {
			upload: {
				url: getSubdomainUrl(adapterConfig.storage.upload.subdomain, { host: host })
			},
			download: {
				url: getSubdomainUrl(adapterConfig.storage.download.subdomain, { host: host })
			},
			preview: {
				url: getSubdomainUrl(adapterConfig.storage.preview.subdomain, { host: host })
			},
			thumbnail: {
				url: getSubdomainUrl(adapterConfig.storage.thumbnail.subdomain, { host: host })
			}
		}
	});
}

function getLocalUploaderConfig(uploaderConfig, options) {
	options = options || {};
	var host = options.host;
	var uploadUrl = getSubdomainUrl(uploaderConfig.uploadSubdomain, { host: host });
	var downloadUrl = getSubdomainUrl(uploaderConfig.downloadSubdomain, { host: host });
	return merge({}, uploaderConfig, {
		uploadUrl: uploadUrl + uploaderConfig.uploadPath,
		downloadUrl: downloadUrl + uploaderConfig.uploadPath
	});
}

function getDropboxAdapterConfig(adapterConfig, options) {
	options = options || {};
	var adminUrl = options.adminUrl;
	var demoUrl = options.demoUrl;
	var oauthCallbackPath = '/login/dropbox/oauth2/callback';
	return merge({}, adapterConfig, {
		login: {
			admin: {
				loginCallbackUrl: adapterConfig.login.admin.loginCallbackUrl || (stripTrailingSlash(adminUrl) + oauthCallbackPath)
			},
			demo: {
				loginCallbackUrl: adapterConfig.login.demo.loginCallbackUrl || (stripTrailingSlash(demoUrl) + oauthCallbackPath)
			}
		}
	});


	function stripTrailingSlash(string) {
		var REGEXP_TRAILING_SLASH = /\/+$/;
		return string.replace(REGEXP_TRAILING_SLASH, '');
	}
}

function getGoogleAdapterConfig(adapterConfig, options) {
	options = options || {};
	var adminUrl = options.adminUrl;
	var demoUrl = options.demoUrl;
	var oauthCallbackPath = '/login/google/oauth2/callback';
	return merge({}, adapterConfig, {
		login: {
			admin: {
				loginCallbackUrl: adapterConfig.login.admin.loginCallbackUrl || (stripTrailingSlash(adminUrl) + oauthCallbackPath)
			},
			demo: {
				loginCallbackUrl: adapterConfig.login.demo.loginCallbackUrl || (stripTrailingSlash(demoUrl) + oauthCallbackPath)
			}
		}
	});


	function stripTrailingSlash(string) {
		var REGEXP_TRAILING_SLASH = /\/+$/;
		return string.replace(REGEXP_TRAILING_SLASH, '');
	}
}
