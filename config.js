var config = {};

config.dropbox = {};
config.dropbox.appKey = process.env.APP_KEY || null;
config.dropbox.appSecret = process.env.APP_SECRET || null;
config.dropbox.appToken = process.env.APP_TOKEN || null;

module.exports = config;
