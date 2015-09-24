'use strict';

var fs = require('fs');

var config = {};

config.host = process.env.HOST || 'localhost';

config.http = {};
config.http.port = process.env.PORT || 80;

config.https = {};
config.https.port = process.env.HTTPS_PORT || null;
config.https.key = process.env.HTTPS_KEY ? fs.readFileSync(process.env.HTTPS_KEY) : null;
config.https.cert = process.env.HTTPS_CERT ? fs.readFileSync(process.env.HTTPS_CERT) : null;

config.adapters = {};

if (process.env.LOCAL === 'true') {
	config.adapters.local = {};
	config.adapters.local.auth = {};
	config.adapters.local.auth.strategy = 'bcrypt';
	config.adapters.local.auth.options = { strength: process.env.LOCAL_BCRYPT_STRENGTH || 10 };
}

if (process.env.DROPBOX_APP_KEY) {
	config.adapters.dropbox = {};
	config.adapters.dropbox.appKey = process.env.DROPBOX_APP_KEY || null;
	config.adapters.dropbox.appSecret = process.env.DROPBOX_APP_SECRET || null;
	config.adapters.dropbox.loginCallbackUrl = process.env.DROPBOX_OAUTH2_LOGIN_CALLBACK || null;
	config.adapters.dropbox.registerCallbackUrl = process.env.DROPBOX_OAUTH2_REGISTER_CALLBACK || null;
}

config.db = {};
config.db.uri = process.env.MONGOLAB_URI || process.env.MONGOHQ_URL || process.env.MONGODB_URI || null;

config.newRelic = Boolean(process.env.NEW_RELIC_LICENSE_KEY);

config.themes = {};
config.themes.root = process.env.THEMES_ROOT || null;
config.themes.default = process.env.THEMES_DEFAULT || null;

config.auth = {};
config.auth.site = {};
config.auth.site.strategy = 'bcrypt';
config.auth.site.options = { strength: process.env.SITE_USER_BCRYPT_STRENGTH || 10 };

module.exports = config;
