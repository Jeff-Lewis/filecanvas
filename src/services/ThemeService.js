'use strict';

var path = require('path');
var merge = require('lodash.merge');

var loadThemes = require('../utils/loadThemes');
var HttpError = require('../errors/HttpError');

var engines = require('../engines');

function ThemeService(options) {
	options = options || {};
	var themesPath = options.themesPath;

	var themes = loadThemes(themesPath);

	this.themesPath = themesPath;
	this.themes = themes;
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

ThemeService.prototype.getThemeTemplate = function(themeId, templateId) {
	var theme = this.getTheme(themeId);
	if (!(templateId in theme.templates)) {
		throw new HttpError(404, 'Invalid template: ' + templateId);
	}
	return theme.templates[templateId];
};

module.exports = ThemeService;
