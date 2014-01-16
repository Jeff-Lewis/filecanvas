var config = {};

config.dropbox = {};
config.dropbox.appKey = process.env.APP_KEY || null;
config.dropbox.appSecret = process.env.APP_SECRET || null;
config.dropbox.appToken = process.env.APP_TOKEN || null;

config.mongodb = {};
config.mongodb.uri = process.env.MONGOLAB_URI || process.env.MONGOHQ_URL || 'mongodb://localhost/dropkick';

module.exports = config;
