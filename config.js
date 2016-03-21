'use strict';

var fs = require('fs');

var config = {};

config.http = {};
config.http.port = Number(process.env.PORT || 80);
config.http.timeout = Number(process.env.HTTP_TIMEOUT || 20000);

config.https = {};
config.https.port = process.env.HTTPS === 'true' ? Number(process.env.HTTPS_PORT || 443) : null;
config.https.cert = process.env.HTTPS === 'true' ? fs.readFileSync(process.env.HTTPS_CERT) : null;
config.https.key = process.env.HTTPS === 'true' ? fs.readFileSync(process.env.HTTPS_KEY) : null;
config.https.timeout = Number(process.env.HTTPS_TIMEOUT || config.http.timeout);

config.host = {};
config.host.hostname = process.env.HOST || 'localhost';
config.host.protocol = process.env.HOST_PROTOCOL || (config.https.port ? 'https:' : 'http:');
config.host.port = process.env.HOST_PORT ? Number(process.env.HOST_PORT) : (config.https.port ? config.https.port : config.http.port);

config.session = {};
config.session.cookieSecret = process.env.COOKIE_SECRET || null;
config.session.store = process.env.REDISCLOUD_URL || process.env.REDIS_URL || null;
config.session.duration = process.env.SESSION_DURATION || 3600;

config.db = {};
config.db.url = process.env.MONGOLAB_URI || process.env.MONGOHQ_URL || process.env.MONGODB_URL || null;

config.cache = {};
config.cache.url = process.env.REDISCLOUD_URL || process.env.REDIS_URL || null;

config.analytics = {};
config.analytics.admin = {};
config.analytics.admin.google = process.env.GOOGLE_ANALYTICS_ID_ADMIN || null;
config.analytics.sites = {};
config.analytics.sites.google = process.env.GOOGLE_ANALYTICS_ID_SITES || null;
config.analytics.demo = {};
config.analytics.demo.google = process.env.GOOGLE_ANALYTICS_ID_DEMO || null;
config.analytics.themes = {};
config.analytics.themes.google = process.env.GOOGLE_ANALYTICS_ID_THEMES || null;

config.newRelic = Boolean(process.env.NEW_RELIC_LICENSE_KEY);

config.templates = {};
config.templates.app = process.env.TEMPLATES_APP || null;
config.templates.site = process.env.TEMPLATES_SITE || null;

config.www = {};
config.www.url = process.env.WWW_URL || null;
config.www.siteRoot = process.env.WWW_SITE_ROOT || null;

config.assets = {};
config.assets.url = process.env.ASSETS_URL || null;

config.admin = {};
config.admin.url = process.env.ADMIN_URL || null;

config.demo = {};
config.demo.url = process.env.DEMO_URL || null;

config.themes = {};
config.themes.root = process.env.THEMES_ROOT || null;
config.themes.url = process.env.THEMES_URL || null;

config.auth = {};
config.auth.site = {};
config.auth.site.strategy = 'bcrypt';
config.auth.site.options = { strength: (process.env.SITE_USER_BCRYPT_STRENGTH ? Number(process.env.SITE_USER_BCRYPT_STRENGTH) : 10) };

config.adapters = {};

config.uploaders = {};
config.uploaders.admin = {};
config.uploaders.demo = {};

if (process.env.LOCAL === 'true') {
	config.adapters.local = {
		login: {
			strategy: 'bcrypt',
			options: {
				strength: (process.env.LOCAL_BCRYPT_STRENGTH ? Number(process.env.LOCAL_BCRYPT_STRENGTH) : 10)
			}
		},
		storage: {
			adapterLabel: process.env.LOCAL_NAME || 'Filecanvas server',
			rootLabel: process.env.LOCAL_LABEL || 'Filecanvas server',
			defaultSitesPath: process.env.LOCAL_SITE_PATH || '/',
			sitesRoot: process.env.LOCAL_SITE_ROOT || null,
			upload: {
				subdomain: 'upload'
			},
			download: {
				subdomain: 'download'
			},
			preview: {
				subdomain: 'media'
			},
			thumbnail: {
				subdomain: 'thumbnail',
				format: null,
				width: 360,
				height: 360
			}
		}
	};
}

if (process.env.DROPBOX_APP_KEY) {
	config.adapters.dropbox = {
		login: {
			appKey: process.env.DROPBOX_APP_KEY || null,
			appSecret: process.env.DROPBOX_APP_SECRET || null,
			loginCallbackUrl: process.env.DROPBOX_OAUTH2_LOGIN_CALLBACK || null
		},
		storage: {
			adapterLabel: 'Dropbox',
			rootLabel: '${user}’s Dropbox',
			defaultSitesPath: process.env.DROPBOX_SITE_PATH || '/',
			appKey: process.env.DROPBOX_APP_KEY || null,
			appSecret: process.env.DROPBOX_APP_SECRET || null
		}
	};
}

if (process.env.GOOGLE_CLIENT_ID) {
	config.adapters.google = {
		login: {
			clientId: process.env.GOOGLE_CLIENT_ID || null,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET || null,
			loginCallbackUrl: process.env.GOOGLE_OAUTH2_LOGIN_CALLBACK || null,
			authOptions: {
				accessType: 'offline',
				prompt: 'select_account',
				scope: [
					'email',
					'profile',
					'https://www.googleapis.com/auth/drive'
				]
			}
		},
		storage: {
			adapterLabel: 'Google Drive',
			rootLabel: '${user}’s Drive',
			defaultSitesPath: process.env.GOOGLE_SITE_PATH || '/',
			clientId: process.env.GOOGLE_CLIENT_ID || null,
			clientSecret: process.env.GOOGLE_CLIENT_SECRET || null
		}
	};
}

if (process.env.AWS_S3_BUCKET_THEME_UPLOADS) {
	config.uploaders.admin = {
		adapter: 's3',
		bucket: process.env.AWS_S3_BUCKET_THEME_UPLOADS,
		root: 'users'
	};
} else if (process.env.LOCAL_ASSET_ROOT) {
	config.uploaders.admin = {
		adapter: 'local',
		uploadPath: 'editor-uploads/',
		uploadSubdomain: 'site-uploads',
		downloadSubdomain: 'site-downloads',
		assetRoot: process.env.LOCAL_ASSET_ROOT
	};
}
if (process.env.AWS_S3_BUCKET_DEMO_UPLOADS) {
	config.uploaders.demo = {
		adapter: 's3',
		bucket: process.env.AWS_S3_BUCKET_DEMO_UPLOADS,
		root: 'sessions'
	};
} else if (process.env.LOCAL_ASSET_ROOT) {
	config.uploaders.demo = {
		adapter: 'local',
		uploadPath: 'editor-uploads/',
		uploadSubdomain: 'demo-uploads',
		downloadSubdomain: 'demo-downloads',
		assetRoot: process.env.LOCAL_ASSET_ROOT
	};
}

module.exports = config;
