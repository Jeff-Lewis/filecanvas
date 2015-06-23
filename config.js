'use strict';

var config = {};

config.dropbox = {};
config.dropbox.appKey = process.env.DROPBOX_APP_KEY || null;
config.dropbox.appSecret = process.env.DROPBOX_APP_SECRET || null;
config.dropbox.appToken = process.env.DROPBOX_APP_TOKEN || null;
config.dropbox.appRoot = process.env.DROPBOX_APP_ROOT || '/.shunt/sites/';

config.mongodb = {};
config.mongodb.uri = process.env.MONGOLAB_URI || process.env.MONGOHQ_URL || process.env.MONGODB_URI || null;

config.urls = {};
config.urls.templates = process.env.TEMPLATES_URL || '//templates.${HOST}/';

config.templates = {};
config.templates['default'] = 'fathom';

module.exports = config;
