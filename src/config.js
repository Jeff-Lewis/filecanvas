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

config.providers = {};
config.providers.dropbox = {};
config.providers.dropbox.appKey = process.env.DROPBOX_APP_KEY || null;
config.providers.dropbox.appSecret = process.env.DROPBOX_APP_SECRET || null;
config.providers.dropbox.loginCallbackUrl = process.env.DROPBOX_OAUTH2_LOGIN_CALLBACK || null;
config.providers.dropbox.registerCallbackUrl = process.env.DROPBOX_OAUTH2_REGISTER_CALLBACK || null;

config.db = {};
config.db.uri = process.env.MONGOLAB_URI || process.env.MONGOHQ_URL || process.env.MONGODB_URI || null;

config.newRelic = Boolean(process.env.NEW_RELIC_LICENSE_KEY);

config.themes = {};
config.themes.root = process.env.THEMES_ROOT || null;
config.themes.default = process.env.THEMES_DEFAULT || null;

config.auth = {};
config.auth.site = {};
config.auth.site.strategies = {};
config.auth.site.strategies.bcrypt = {};
config.auth.site.strategies.bcrypt.strength = process.env.AUTH_SITE_BCRYPT_STRENGTH || 10;
config.auth.site.strategies.sha256 = {};
config.auth.site.strategies.sha256.saltLength = process.env.AUTH_SITE_SHA256_SALT_LENGTH || 64;
config.auth.site.defaultStrategy = process.env.AUTH_SITE_STRATEGY || 'bcrypt';

module.exports = config;
