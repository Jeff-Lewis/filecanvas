'use strict';

exports.DB_COLLECTION_SITES = 'sites';
exports.DB_COLLECTION_USERS = 'users';

exports.THEME_MANIFEST_PATH = 'theme.json';
exports.THEME_THUMBNAIL_DEFAULT = 'thumbnail.png';
exports.THEME_TEMPLATES_DEFAULT = {
	'index': {
		engine: 'handlebars',
		filename: 'templates/index.hbs',
		options: {
			partials: 'templates/partials'
		}
	},
	'login': {
		engine: 'handlebars',
		filename: 'templates/login.hbs',
		options: {
			partials: 'templates/partials'
		}
	}
};
exports.THEME_PREVIEW_CONFIG_PATH = 'preview/config.json';
exports.THEME_PREVIEW_FILES_PATH = 'preview/files';

exports.HANDLEBARS_DEFAULT_TEMPLATE_OPTIONS = {
	helpers: undefined,
	partials: undefined,
	data: undefined
};
exports.HANDLEBARS_COMPILER_OPTIONS = {
	knownHelpersOnly: true
};
exports.HANDLEBARS_SERIALIZED_TEMPLATES_NAMESPACE = 'Handlebars.templates';
exports.HANDLEBARS_SERIALIZED_PARTIALS_NAMESPACE = 'Handlebars.partials';

exports.HTMLBARS_DEFAULT_TEMPLATE_OPTIONS = {
	helpers: undefined,
	partials: undefined,
	data: undefined
};
exports.HTMLBARS_COMPILER_OPTIONS = {
};
exports.HTMLBARS_SERIALIZED_TEMPLATES_NAMESPACE = 'Htmlbars.templates';
exports.HTMLBARS_SERIALIZED_PARTIALS_NAMESPACE = 'Htmlbars.partials';
