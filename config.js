'use strict';

var fs = require('fs');

var config = {};

config.http = {};
config.http.port = process.env.PORT || 80;

config.https = {};
config.https.port = process.env.HTTPS_PORT || null;
config.https.key = process.env.HTTPS_KEY ? fs.readFileSync(process.env.HTTPS_KEY) : null;
config.https.cert = process.env.HTTPS_CERT ? fs.readFileSync(process.env.HTTPS_CERT) : null;

config.dropbox = {};
config.dropbox.appKey = process.env.DROPBOX_APP_KEY || null;
config.dropbox.appSecret = process.env.DROPBOX_APP_SECRET || null;
config.dropbox.callbackUrl = process.env.DROPBOX_OAUTH2_CALLBACK || null;

config.mongodb = {};
config.mongodb.uri = process.env.MONGOLAB_URI || process.env.MONGOHQ_URL || process.env.MONGODB_URI || null;

config.newRelic = Boolean(process.env.NEW_RELIC_LICENSE_KEY);

config.urls = {};
config.urls.templates = process.env.TEMPLATES_ROOT || '//templates.${HOST}/';

config.templates = {};
config.templates.default = 'fathom';

module.exports = config;
