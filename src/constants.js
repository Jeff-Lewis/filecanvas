var path = require('path');

var readDirFiles = require('read-dir-files');

exports.DB_COLLECTION_SITES = 'sites';
exports.DB_COLLECTION_USERS = 'users';

exports.SITE_TEMPLATE_FILES = readDirFiles.readSync(path.join(__dirname, '../templates/sites/files'));
