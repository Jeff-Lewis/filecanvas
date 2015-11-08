'use strict';

var fs = require('fs');
var path = require('path');
var merge = require('lodash.merge');
var memoize = require('lodash.memoize');

var constants = require('../constants');

var loadFileMetadata = require('./loadFileMetadata');

var THEME_MANIFEST_PATH = constants.THEME_MANIFEST_PATH;
var THEME_THUMBNAIL_PATH = constants.THEME_THUMBNAIL_PATH;
var THEME_TEMPLATES = constants.THEME_TEMPLATES;
var THEME_PREVIEW_CONFIG_PATH = constants.THEME_PREVIEW_CONFIG_PATH;
var THEME_PREVIEW_FILES_PATH = constants.THEME_PREVIEW_FILES_PATH;

module.exports = memoize(function(themesPath) {
	var themes = fs.readdirSync(themesPath).filter(function(filename) {
		return (filename.charAt(0) !== '.') && fs.statSync(path.join(themesPath, filename)).isDirectory();
	}).reduce(function(themes, filename) {
		var themePath = path.join(themesPath, filename);
		var themeManifestPath = path.join(themePath, THEME_MANIFEST_PATH);
		var theme = readJson(themeManifestPath);
		theme.id = filename;
		theme.thumbnail = theme.thumbnail || THEME_THUMBNAIL_PATH;
		theme.templates = merge({}, THEME_TEMPLATES, theme.templates);
		theme.defaults = parseThemeConfigDefaults(theme.config);
		// TODO: Move to themes app
		var previewConfigPath = path.join(themePath, THEME_PREVIEW_CONFIG_PATH);
		var previewFilesPath = path.join(themePath, THEME_PREVIEW_FILES_PATH);
		theme.preview = {
			config: readJson(previewConfigPath),
			files: loadFileMetadata(previewFilesPath, {
				root: previewFilesPath,
				contents: true,
				sync: true
			})
		};
		themes[filename] = theme;
		return themes;
	}, {});
	return themes;
});


function parseThemeConfigDefaults(configSchema) {
	return configSchema.reduce(function(defaults, configGroup) {
		var configGroupDefaults = parseConfigGroupDefaults(configGroup);
		defaults[configGroup.name] = configGroupDefaults;
		return defaults;
	}, {});

	function parseConfigGroupDefaults(configGroup) {
		var configGroupFields = configGroup.fields;
		return configGroupFields.reduce(function(defaults, field) {
			defaults[field.name] = field.default;
			return defaults;
		}, {});
	}
}

function readJson(filePath) {
	return JSON.parse(fs.readFileSync(filePath, { encoding: 'utf8' }));
}
