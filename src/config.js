'use strict';

var fs = require('fs');

var config = {};

config.http = {};
config.http.port = Number(process.env.PORT || 80);

config.https = {};
config.https.port = process.env.HTTPS === 'true' ? Number(process.env.HTTPS_PORT || 443) : null;
config.https.cert = process.env.HTTPS === 'true' ? fs.readFileSync(process.env.HTTPS_CERT) : null;
config.https.key = process.env.HTTPS === 'true' ? fs.readFileSync(process.env.HTTPS_KEY) : null;

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

config.newRelic = Boolean(process.env.NEW_RELIC_LICENSE_KEY);

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
config.themes.url = process.env.THEMES_URL || null;
config.themes.thumbnail = {};
config.themes.thumbnail.format = null;
config.themes.thumbnail.width = 256;
config.themes.thumbnail.height = 256;

config.auth = {};
config.auth.site = {};
config.auth.site.strategy = 'bcrypt';
config.auth.site.options = { strength: process.env.SITE_USER_BCRYPT_STRENGTH || 10 };

config.adapters = {};

config.uploaders = {};
config.uploaders.admin = {};
config.uploaders.demo = {};

if (process.env.LOCAL) {
	config.adapters.local = {
		login: {
			admin: {
				persistent: true,
				strategy: 'bcrypt',
				options: {
					strength: process.env.LOCAL_BCRYPT_STRENGTH || 10
				}
			},
			demo: {
				persistent: false,
				strategy: 'bcrypt',
				options: {
					strength: process.env.LOCAL_BCRYPT_STRENGTH || 10
				}
			}
		},
		storage: {
			adapterName: process.env.LOCAL_NAME || 'Filecanvas server',
			adapterLabel: process.env.LOCAL_LABEL || 'Filecanvas server',
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
				width: 256,
				height: 256
			}
		}
	};
}

if (process.env.DROPBOX_APP_KEY) {
	config.adapters.dropbox = {
		login: {
			admin: {
				persistent: true,
				appKey: process.env.DROPBOX_APP_KEY || null,
				appSecret: process.env.DROPBOX_APP_SECRET || null,
				loginCallbackUrl: process.env.DROPBOX_OAUTH2_LOGIN_CALLBACK || null
			},
			demo: {
				persistent: false,
				appKey: process.env.DROPBOX_APP_KEY || null,
				appSecret: process.env.DROPBOX_APP_SECRET || null,
				loginCallbackUrl: process.env.DROPBOX_OAUTH2_DEMO_LOGIN_CALLBACK || null
			}
		},
		storage: {
			adapterName: 'Dropbox',
			adapterLabel: '${user}’s Dropbox',
			defaultSitesPath: process.env.DROPBOX_SITE_PATH || '/',
			appKey: process.env.DROPBOX_APP_KEY || null,
			appSecret: process.env.DROPBOX_APP_SECRET || null
		}
	};
}

if (process.env.GOOGLE === 'true') {
	config.adapters.google = {
		login: {
			admin: {},
			demo: {}
		},
		storage: {}
	};
}

if (process.env.AWS_S3_BUCKET) {
	config.uploaders.admin = {
		adapter: 's3',
		bucket: process.env.AWS_S3_BUCKET
	};
	config.uploaders.demo = {
		adapter: 's3',
		bucket: process.env.AWS_S3_BUCKET
	};
} else if (process.env.LOCAL_ASSET_ROOT) {
	config.uploaders.admin = {
		adapter: 'local',
		uploadPath: 'editor-uploads/',
		uploadSubdomain: 'site-uploads',
		downloadSubdomain: 'site-downloads',
		assetRoot: process.env.LOCAL_ASSET_ROOT
	};
	config.uploaders.demo = {
		adapter: 'local',
		uploadPath: 'editor-uploads/',
		uploadSubdomain: 'demo-uploads',
		downloadSubdomain: 'demo-downloads',
		assetRoot: process.env.LOCAL_ASSET_ROOT
	};
}

module.exports = config;
