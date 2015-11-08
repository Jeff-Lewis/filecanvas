'use strict';

exports.DB_COLLECTION_SITES = 'sites';
exports.DB_COLLECTION_USERS = 'users';

exports.THEME_MANIFEST_PATH = 'theme.json';
exports.THEME_THUMBNAIL_PATH = 'thumbnail.png';
exports.THEME_TEMPLATES = {
	'index': {
		filename: 'index.hbs',
		options: null
	},
	'login': {
		filename: 'login.hbs',
		options: null
	}
};
exports.THEME_PREVIEW_CONFIG_PATH = 'preview/config.json';
exports.THEME_PREVIEW_FILES_PATH = 'preview/files';

exports.HANDLEBARS_COMPILER_OPTIONS = {
	knownHelpersOnly: true
};
exports.HTMLBARS_COMPILER_OPTIONS = {
	knownHelpersOnly: true
};
