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

config.dropbox = {};
config.dropbox.appKey = process.env.DROPBOX_APP_KEY || null;
config.dropbox.appSecret = process.env.DROPBOX_APP_SECRET || null;
config.dropbox.loginCallbackUrl = process.env.DROPBOX_OAUTH2_LOGIN_CALLBACK || null;
config.dropbox.registerCallbackUrl = process.env.DROPBOX_OAUTH2_REGISTER_CALLBACK || null;

config.db = {};
config.db.uri = process.env.MONGOLAB_URI || process.env.MONGOHQ_URL || process.env.MONGODB_URI || null;

config.newRelic = Boolean(process.env.NEW_RELIC_LICENSE_KEY);

config.templates = {};
config.templates.root = process.env.TEMPLATES_ROOT || null;
config.templates.options = (process.env.TEMPLATES ? JSON.parse(process.env.TEMPLATES) : []);
config.templates.default = process.env.TEMPLATES_DEFAULT || null;

module.exports = config;
