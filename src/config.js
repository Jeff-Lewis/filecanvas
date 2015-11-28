'use strict';

var path = require('path');
var fs = require('fs');
var getSubdomainUrl = require('./utils/getSubdomainUrl');

var config = {};

config.host = process.env.HOST || 'localhost';

config.http = {};
config.http.port = process.env.PORT || 80;

config.https = {};
config.https.port = process.env.HTTPS_PORT || null;
config.https.key = process.env.HTTPS_KEY ? fs.readFileSync(process.env.HTTPS_KEY) : null;
config.https.cert = process.env.HTTPS_CERT ? fs.readFileSync(process.env.HTTPS_CERT) : null;

config.cookieSecret = process.env.COOKIE_SECRET || null;

config.adapters = {};
config.uploaders = {};
config.uploaders.admin = {};
config.uploaders.demo = {};

if (process.env.LOCAL === 'true') {
	config.adapters.local = {};
	config.adapters.local.metadata = {};
	config.adapters.local.metadata.name = process.env.LOCAL_NAME || 'Shunt server';
	config.adapters.local.metadata.label = process.env.LOCAL_LABEL || 'Shunt sites';
	config.adapters.local.metadata.path = '/sites/';
	config.adapters.local.root = process.env.LOCAL_SITE_ROOT || path.resolve(__dirname, '../data');
	config.adapters.local.auth = {};
	config.adapters.local.auth.strategy = 'bcrypt';
	config.adapters.local.auth.options = { strength: process.env.LOCAL_BCRYPT_STRENGTH || 10 };
	config.adapters.local.upload = {};
	config.adapters.local.upload.subdomain = 'upload';
	config.adapters.local.upload.url = getSubdomainUrl({
		subdomain: config.adapters.local.upload.subdomain,
		host: config.host,
		protocol: config.https.port ? 'https' : 'http',
		port: config.https.port || config.http.port
	});
	config.adapters.local.download = {};
	config.adapters.local.download.subdomain = 'download';
	config.adapters.local.download.url = getSubdomainUrl({
		subdomain: config.adapters.local.download.subdomain,
		host: config.host,
		protocol: config.https.port ? 'https' : 'http',
		port: config.https.port || config.http.port
	});
	config.adapters.local.thumbnail = {};
	config.adapters.local.thumbnail.subdomain = 'thumbnail';
	config.adapters.local.thumbnail.url = getSubdomainUrl({
		subdomain: config.adapters.local.thumbnail.subdomain,
		host: config.host,
		protocol: config.https.port ? 'https' : 'http',
		port: config.https.port || config.http.port
	});
	config.adapters.local.thumbnail.format = null;
	config.adapters.local.thumbnail.width = 256;
	config.adapters.local.thumbnail.height = 256;

	config.uploaders.admin = {
		name: 'local',
		uploadUrl: config.adapters.local.upload.url + 'editor-uploads/admin/',
		downloadUrl: config.adapters.local.download.url + 'editor-uploads/admin/'
	};

	config.uploaders.demo = {
		name: 'local',
		uploadUrl: config.adapters.local.upload.url + 'editor-uploads/demo/',
		downloadUrl: config.adapters.local.download.url + 'editor-uploads/demo/'
	};
}

if (process.env.DROPBOX_APP_KEY) {
	config.adapters.dropbox = {};
	config.adapters.dropbox.metadata = {};
	config.adapters.dropbox.metadata.path = '/Shunt/';
	config.adapters.dropbox.appKey = process.env.DROPBOX_APP_KEY || null;
	config.adapters.dropbox.appSecret = process.env.DROPBOX_APP_SECRET || null;
	config.adapters.dropbox.loginCallbackUrl = process.env.DROPBOX_OAUTH2_LOGIN_CALLBACK || null;
	config.adapters.dropbox.demoLoginCallbackUrl = process.env.DROPBOX_OAUTH2_DEMO_LOGIN_CALLBACK || null;
}

if (process.env.AWS_ACCESS_KEY_ID) {
	config.uploaders.admin = {
		name: 's3',
		accessKey: process.env.AWS_ACCESS_KEY_ID,
		secretKey: process.env.AWS_SECRET_ACCESS_KEY,
		bucket: process.env.AWS_S3_BUCKET
	};
	config.uploaders.demo = {
		name: 's3',
		accessKey: process.env.AWS_ACCESS_KEY_ID,
		secretKey: process.env.AWS_SECRET_ACCESS_KEY,
		bucket: process.env.AWS_S3_BUCKET
	};
}

config.db = {};
config.db.uri = process.env.MONGOLAB_URI || process.env.MONGOHQ_URL || process.env.MONGODB_URI || null;

config.newRelic = Boolean(process.env.NEW_RELIC_LICENSE_KEY);

config.assets = {};
config.assets.root = process.env.ASSETS_ROOT || null;

config.admin = {};
config.admin.root = process.env.ADMIN_ROOT || null;

config.themes = {};
config.themes.root = process.env.THEMES_ROOT || null;
config.themes.thumbnail = {};
config.themes.thumbnail.format = null;
config.themes.thumbnail.width = 256;
config.themes.thumbnail.height = 256;

config.auth = {};
config.auth.site = {};
config.auth.site.strategy = 'bcrypt';
config.auth.site.options = { strength: process.env.SITE_USER_BCRYPT_STRENGTH || 10 };

module.exports = config;
