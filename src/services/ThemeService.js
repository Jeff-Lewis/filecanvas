'use strict';

var fs = require('fs');
var path = require('path');
var merge = require('lodash.merge');
var memoize = require('lodash.memoize');

var constants = require('../constants');
var engines = require('../engines');

var loadFileMetadata = require('../utils/loadFileMetadata');
var resolvePartials = require('../utils/resolvePartials');

var HttpError = require('../errors/HttpError');

var THEME_MANIFEST_PATH = constants.THEME_MANIFEST_PATH;
var THEME_THUMBNAIL_DEFAULT = constants.THEME_THUMBNAIL_DEFAULT;
var THEME_TEMPLATES_DEFAULT = constants.THEME_TEMPLATES_DEFAULT;
var THEME_PREVIEW_CONFIG_PATH = constants.THEME_PREVIEW_CONFIG_PATH;
var THEME_PREVIEW_FILES_PATH = constants.THEME_PREVIEW_FILES_PATH;


function ThemeService(options) {
	options = options || {};
	this.themesPath = options.themesPath;

	this.themes = {};
	this.loadThemes();
}

ThemeService.prototype.themesPath = null;
ThemeService.prototype.themes = null;

ThemeService.prototype.loadThemes = function() {
	var themesPath = this.themesPath;
	var self = this;
	var themeIds = getThemeFolders(themesPath);
	themeIds.forEach(function(themeId) {
		self.loadTheme(themeId);
	});

	function getThemeFolders(themesPath) {
		return fs.readdirSync(themesPath).filter(function(filename) {
			return (filename.charAt(0) !== '.') && fs.statSync(path.join(themesPath, filename)).isDirectory();
		});
	}
};

ThemeService.prototype.loadTheme = function(themeId) {
	var themesPath = this.themesPath;
	var themePath = path.join(themesPath, themeId);
	var themeManifestPath = path.join(themePath, THEME_MANIFEST_PATH);
	var theme = readJson(themeManifestPath);
	theme.id = themeId;
	theme.path = themePath;
	theme.thumbnail = parseThemeThumbnail(theme.thumbnail);
	theme.defaults = parseThemeConfigDefaults(theme.config);
	theme.templates = loadThemeTemplates(theme.templates, themePath);
	theme.preview = parseThemePreview(themePath);
	this.themes[themeId] = theme;
	return theme;


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
		var templatePath = path.resolve(themePath, templateFilename);
		var templateEngine = templateConfig.engine;
		var templateOptions = templateConfig.options;
		if (templateOptions.partials) {
			var partialsRoot = path.resolve(themePath, templateOptions.partials);
			templateOptions.partials = resolvePartials(partialsRoot);
		}
		var template = {
			id: templateId,
			engine: templateEngine,
			path: templatePath,
			options: templateOptions
		};
		return template;
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
};

ThemeService.prototype.getThemes = function() {
	return this.themes;
};

ThemeService.prototype.getTheme = function(themeId) {
	var themes = this.themes;
	if (!(themeId in themes)) {
		throw new HttpError(404, 'Invalid theme: ' + themeId);
	}
	return themes[themeId];
};

ThemeService.prototype.getThemeAssetUrl = function(themeId, assetPath, themeAssetsUrl) {
	var isExternalUrl = getIsExternalUrl(assetPath);
	if (isExternalUrl) { return assetPath; }
	return themeAssetsUrl + themeId + '/' + assetPath;


	function getIsExternalUrl(assetPath) {
		return /^(?:\w+:)?\/\//.test(assetPath);
	}
};

ThemeService.prototype.getPreviousTheme = function(themeId) {
	var themes = this.themes;
	var themeIds = Object.keys(themes);
	var themeIndex = themeIds.indexOf(themeId);
	var previousThemeIndex = (themeIndex <= 0 ? themeIds.length - 1 : themeIndex - 1);
	var previousThemeId = themeIds[previousThemeIndex];
	var previousTheme = themes[previousThemeId];
	return previousTheme;
};

ThemeService.prototype.getNextTheme = function(themeId) {
	var themes = this.themes;
	var themeIds = Object.keys(themes);
	var themeIndex = themeIds.indexOf(themeId);
	var nextThemeIndex = (themeIndex >= themeIds.length - 1 ? 0 : themeIndex + 1);
	var nextThemeId = themeIds[nextThemeIndex];
	var nextTheme = themes[nextThemeId];
	return nextTheme;
};

ThemeService.prototype.getThemeTemplate = function(themeId, templateId) {
	var theme = this.getTheme(themeId);
	if (!(templateId in theme.templates)) {
		throw new HttpError(404, 'Invalid template: ' + templateId);
	}
	return theme.templates[templateId];
};

ThemeService.prototype.renderThemeTemplate = function(themeId, templateId, context) {
	var self = this;
	return new Promise(function(resolve, reject) {
		var template = self.getThemeTemplate(themeId, templateId);
		var templatePath = template.path;
		var templateEngine = template.engine;
		var templateOptions = template.options;
		var engine = engines[templateEngine];
		resolve(
			engine.render(templatePath, context, templateOptions)
		);
	});
};

ThemeService.prototype.serializeThemeTemplate = function(themeId, templateId) {
	var self = this;
	return new Promise(function(resolve, reject) {
		var template = self.getThemeTemplate(themeId, templateId);
		var templatePath = template.path;
		var templateEngine = template.engine;
		var templateOptions = template.options;
		var engine = engines[templateEngine];
		resolve(
			engine.serialize(templatePath, templateId, templateOptions)
		);
	});
};

function readJson(filePath) {
	return JSON.parse(fs.readFileSync(filePath, { encoding: 'utf8' }));
}

module.exports = memoize(function(options) {
	return new ThemeService(options);
}, function resolver(options) {
	return options.themesPath;
});

