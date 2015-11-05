'use strict';

var fs = require('fs');
var path = require('path');
var merge = require('lodash.merge');

var constants = require('../constants');

var THEME_MANIFEST_PATH = constants.THEME_MANIFEST_PATH;
var THEME_THUMBNAIL_PATH = constants.THEME_THUMBNAIL_PATH;
var THEME_TEMPLATE_PATHS = constants.THEME_TEMPLATE_PATHS;

module.exports = function(themesPath) {
	var filenames = fs.readdirSync(themesPath)
		.filter(function(filename) {
			return filename.charAt(0) !== '.';
		});
	var themes = filenames.reduce(function(themes, filename) {
		var themePath = path.join(themesPath, filename);
		var themeManifestPath = path.join(themePath, THEME_MANIFEST_PATH);
		var theme = require(themeManifestPath);
		theme.id = filename;
		theme.thumbnail = theme.thumbnail || THEME_THUMBNAIL_PATH;
		theme.templates = merge({}, THEME_TEMPLATE_PATHS, theme.templates);
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

