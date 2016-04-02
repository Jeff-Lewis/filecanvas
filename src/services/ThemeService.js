'use strict';

var fs = require('fs');
var path = require('path');
var memoize = require('lodash.memoize');

var engines = require('../engines');

var resolveThemePaths = require('../utils/resolveThemePaths');

var HttpError = require('../errors/HttpError');

function ThemeService(options) {
	options = options || {};
	var themesPath = options.themesPath;

	this.themes = (themesPath ? preloadThemes(themesPath) : {});


	function preloadThemes(themesPath) {
		var themePaths = getThemeFolders(themesPath);
		return themePaths.reduce(function(themes, themePath) {
			var themeManifestPath = path.resolve(themePath, 'theme.json');
			var themeManifest = readJson(themeManifestPath);
			var theme = resolveThemePaths(themeManifest, themePath);
			themes[theme.id] = theme;
			return themes;
		}, {});


		function getThemeFolders(themesPath) {
			return fs.readdirSync(themesPath)
				.filter(function(filename) {
					return (filename.charAt(0) !== '.') && (filename.charAt(0) !== '_') && fs.statSync(path.join(themesPath, filename)).isDirectory();
				})
				.map(function(filename) {
					return path.join(themesPath, filename);
				});
		}

		function readJson(filePath) {
			return JSON.parse(fs.readFileSync(filePath, { encoding: 'utf8' }));
		}
	}
}

ThemeService.prototype.themesPath = null;
ThemeService.prototype.themes = null;

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

ThemeService.prototype.getThemeTemplate = function(theme, templateId) {
	if (typeof theme === 'string') { theme = this.getTheme(theme); }
	if (!(templateId in theme.templates)) {
		throw new HttpError(404, 'Invalid template: ' + templateId);
	}

	return theme.templates[templateId];
};

ThemeService.prototype.renderThemeTemplate = function(theme, templateId, context) {
	if (typeof theme === 'string') { theme = this.getTheme(theme); }

	var self = this;
	return new Promise(function(resolve, reject) {
		var template = self.getThemeTemplate(theme, templateId);
		var templatePath = template.path;
		var templateEngine = template.engine;
		var templateOptions = template.options;
		var engine = engines[templateEngine];
		resolve(
			engine.render(templatePath, context, templateOptions)
		);
	});
};

ThemeService.prototype.serializeThemeTemplate = function(theme, templateId) {
	if (typeof theme === 'string') { theme = this.getTheme(theme); }

	var self = this;
	return new Promise(function(resolve, reject) {
		var template = self.getThemeTemplate(theme, templateId);
		var templatePath = template.path;
		var templateName = theme.id + ':' + templateId;
		var templateEngine = template.engine;
		var templateOptions = template.options;
		var engine = engines[templateEngine];
		resolve(
			engine.serialize(templatePath, templateName, templateOptions)
		);
	});
};

var uid = 1;
module.exports = memoize(function(options) {
	return new ThemeService(options);
}, function resolver(options) {
	return (options && options.themesPath) || uid++;
});

