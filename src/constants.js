var path = require('path');
var readDirContentsSync = require('./utils/readDirContentsSync');


exports.DB_COLLECTION_SITES = 'sites';
exports.DB_COLLECTION_USERS = 'users';

exports.SITE_TEMPLATE_FILES = readDirContentsSync(path.join(__dirname, '../templates/sites/files'));
