var config = {};

config.dropbox = {};
config.dropbox.appKey = process.env.DROPBOX_APP_KEY || null;
config.dropbox.appSecret = process.env.DROPBOX_APP_SECRET || null;
config.dropbox.appToken = process.env.DROPBOX_APP_TOKEN || null;
config.dropbox.appRoot = process.env.DROPBOX_APP_ROOT || '/.shunt/sites/';

config.mongodb = {};
config.mongodb.uri = process.env.MONGOLAB_URI || process.env.MONGOHQ_URL || process.env.MONGODB_URI || null;

config.email = {};
config.email.from = { 'name': 'Shunt Admin', 'address': 'admin@shunt.io' };

config.templates = {};
config.templates['default'] = 'fathom';

module.exports = config;
