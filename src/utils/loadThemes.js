'use strict';

var fs = require('fs');
var path = require('path');
var merge = require('lodash.merge');

var constants = require('../constants');

var THEME_MANIFEST_FILENAME = constants.THEME_MANIFEST_FILENAME;
var THEME_THUMBNAIL_FILENAME = constants.THEME_THUMBNAIL_FILENAME;
var THEME_TEMPLATE_FILENAMES = constants.THEME_TEMPLATE_FILENAMES;

module.exports = function(themesPath) {
	var filenames = fs.readdirSync(themesPath)
		.filter(function(filename) {
			return filename.charAt(0) !== '.';
		});
	var themes = filenames.reduce(function(themes, filename) {
		var themeManifestPath = path.join(themesPath, filename, THEME_MANIFEST_FILENAME);
		var theme = require(themeManifestPath);
		theme.id = filename;
		theme.thumbnail = theme.thumbnail || THEME_THUMBNAIL_FILENAME;
		theme.templates = merge({}, THEME_TEMPLATE_FILENAMES, theme.templates);
		theme.defaults = parseThemeConfigDefaults(theme.config);
		themes[filename] = theme;
		return themes;
	}, {});
	return themes;


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
};

