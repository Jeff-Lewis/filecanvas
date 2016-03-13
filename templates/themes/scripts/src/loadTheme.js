'use strict';

var fs = require('fs');
var path = require('path');
var merge = require('lodash.merge');

var pluckThemeConfigVersion = require('./pluckThemeConfigVersion');
var parseThemeConfigDefaults = require('../../../../src/utils/parseThemeConfigDefaults');

var THEME_MANIFEST_PATH = 'theme.json';
var THEME_THUMBNAIL_PATH = 'thumbnail.png';
var THEME_TEMPLATES_DEFAULT = {
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

module.exports = function(themePath) {
	var themeId = path.basename(themePath);
	var theme = parseTheme(themePath, themeId);
	return theme;


	function parseTheme(themePath, themeId) {
		var themeManifestPath = path.join(themePath, THEME_MANIFEST_PATH);
		var themeData = readJson(themeManifestPath);
		var themeName = themeData.name;
		var themeConfig = themeData.config;
		var themeThumbnail = parseThemeThumbnail(themeData.thumbnail);
		var themeTemplates = loadThemeTemplates(themeData.templates, themePath);
		var themeDefaults = parseThemeConfigDefaults(themeConfig);
		var themeDemoConfig = parseThemeDemoConfig(themeConfig, themeDefaults);
		var themeFonts = themeData.fonts || null;
		var theme = {
			id: themeId,
			name: themeName,
			thumbnail: themeThumbnail,
			templates: themeTemplates,
			config: themeConfig,
			defaults: themeDefaults,
			demo: themeDemoConfig,
			fonts: themeFonts
		};
		return theme;


		function parseThemeThumbnail(thumbnailPath) {
			return thumbnailPath || THEME_THUMBNAIL_PATH;
		}

		function loadThemeTemplates(templates, themePath) {
			templates = merge({}, THEME_TEMPLATES_DEFAULT, templates);
			return Object.keys(templates).reduce(function(parsedTemplates, templateId) {
				var templateConfig = templates[templateId];
				var parsedTemplate = loadThemeTemplate(templateId, templateConfig, themePath);
				parsedTemplates[templateId] = parsedTemplate;
				return parsedTemplates;
			}, {});
		}

		function loadThemeTemplate(templateId, templateConfig, themePath) {
			templateConfig = merge({}, THEME_TEMPLATES_DEFAULT, templateConfig);
			var templateFilename = templateConfig.filename;
			var templateEngine = templateConfig.engine;
			var templateOptions = templateConfig.options;
			var template = {
				id: templateId,
				engine: templateEngine,
				filename: templateFilename,
				options: templateOptions
			};
			return template;
		}

		function parseThemeDemoConfig(themeConfig, themeDefaults) {
			var demoConfig = pluckThemeConfigVersion(themeConfig, 'demo');
			return merge({}, themeDefaults, demoConfig);
		}
	}
};

function readJson(filePath) {
	return JSON.parse(fs.readFileSync(filePath, { encoding: 'utf8' }));
}
