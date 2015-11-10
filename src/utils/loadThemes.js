'use strict';

var fs = require('fs');
var path = require('path');
var merge = require('lodash.merge');
var memoize = require('lodash.memoize');

var constants = require('../constants');
var engines = require('../engines');

var loadFileMetadata = require('./loadFileMetadata');

var THEME_MANIFEST_PATH = constants.THEME_MANIFEST_PATH;
var THEME_THUMBNAIL_DEFAULT = constants.THEME_THUMBNAIL_DEFAULT;
var THEME_TEMPLATES_DEFAULT = constants.THEME_TEMPLATES_DEFAULT;
var THEME_PREVIEW_CONFIG_PATH = constants.THEME_PREVIEW_CONFIG_PATH;
var THEME_PREVIEW_FILES_PATH = constants.THEME_PREVIEW_FILES_PATH;

module.exports = memoize(function(themesPath) {
	var themes = fs.readdirSync(themesPath).filter(function(filename) {
		return (filename.charAt(0) !== '.') && fs.statSync(path.join(themesPath, filename)).isDirectory();
	}).reduce(function(themes, filename) {
		var themePath = path.join(themesPath, filename);
		var themeManifestPath = path.join(themePath, THEME_MANIFEST_PATH);
		var theme = readJson(themeManifestPath);
		var themeId = filename;
		theme.id = themeId;
		theme.thumbnail = parseThemeThumbnail(theme.thumbnail);
		theme.defaults = parseThemeConfigDefaults(theme.config);
		theme.templates = compileThemeTemplates(themePath, theme.templates);
		theme.preview = parseThemePreview(themePath);
		themes[themeId] = theme;
		return themes;
	}, {});
	return themes;
});


function parseThemeThumbnail(thumbnailPath) {
   return thumbnailPath || THEME_THUMBNAIL_DEFAULT;
}

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

function compileThemeTemplates(themePath, templates) {
	templates = merge({}, THEME_TEMPLATES_DEFAULT, templates);
	return Object.keys(templates).reduce(function(compiledTemplates, templateId) {
		var templateMetadata = templates[templateId];
		var compiledTemplate = compileThemeTemplate(templateMetadata, themePath, templateId);
		compiledTemplates[templateId] = compiledTemplate;
		return compiledTemplates;
	}, {});
}

function compileThemeTemplate(templateMetadata, themePath, templateId) {
	var templateFilename = templateMetadata.filename;
	var templateEngine = templateMetadata.engine;
	var templateOptions = templateMetadata.options;
	var templatePath = path.resolve(themePath, templateFilename);
	var engine = engines[templateEngine];
	if (typeof engine.preload === 'function') {
		engine.preload(templatePath, templateId, templateOptions);
	}
	return {
		engine: templateEngine,
		render: function(context) {
			return engine.render(templatePath, context, templateOptions);
		},
		serialize: memoize(function() {
			return engine.serialize(templatePath, templateId, templateOptions);
		})
	};
}

function parseThemePreview(themePath) {
	var previewConfigPath = path.join(themePath, THEME_PREVIEW_CONFIG_PATH);
	var previewFilesPath = path.join(themePath, THEME_PREVIEW_FILES_PATH);
	return {
		config: readJson(previewConfigPath),
		files: loadFileMetadata(previewFilesPath, {
			root: previewFilesPath,
			contents: true,
			sync: true
		})
	};
}

function readJson(filePath) {
	return JSON.parse(fs.readFileSync(filePath, { encoding: 'utf8' }));
}
