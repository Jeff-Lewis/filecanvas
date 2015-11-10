'use strict';

var fs = require('fs');
var path = require('path');
var merge = require('lodash.merge');
var memoize = require('lodash.memoize');

var loadThemes = require('../utils/loadThemes');
var HttpError = require('../errors/HttpError');

var engines = require('../engines');

var compilePartials = memoize(function(partialsRoot, engineName, engine) {
	if (!partialsRoot) { return Promise.resolve(null); }
	return loadPartialPaths(partialsRoot, engineName)
		.then(function(partialPaths) {
			return Promise.all(
				partialPaths.map(function(partialPath) {
					return engine.compile(partialPath);
				})
			).then(function(compiledPartials) {
				return compiledPartials.reduce(function(compiledPartialsHash, compiledPartial, index) {
					var partialPath = partialPaths[index];
					var partialName = getPartialName(partialPath);
					compiledPartialsHash[partialName] = compiledPartial;
					return compiledPartialsHash;
				}, {});
			});
		});
});

var serializePartials = memoize(function(partialsRoot, engineName, engine) {
	if (!partialsRoot) { return Promise.resolve(null); }
	return loadPartialPaths(partialsRoot, engineName)
		.then(function(partialPaths) {
			return Promise.all(
				partialPaths.map(function(partialPath) {
					var partialName = getPartialName(partialPath);
					return engine.serialize(partialPath, partialName, { partial: true });
				})
			).then(function(serializedPartials) {
				return serializedPartials.reduce(function(serializedPartialsHash, serializedPartial, index) {
					var partialPath = partialPaths[index];
					var partialName = getPartialName(partialPath);
					serializedPartialsHash[partialName] = serializedPartial;
					return serializedPartialsHash;
				}, {});
			});
		});
});

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

ThemeService.prototype.getTemplateMetadata = function(themeId, templateId) {
	var theme = this.getTheme(themeId);
	if (!(templateId in theme.templates)) {
		throw new HttpError(404, 'Invalid template: ' + templateId);
	}
	return theme.templates[templateId];
};

ThemeService.prototype.getTemplateOptions = function(templateMetadata) {
	return merge({}, templateMetadata.options);
};

ThemeService.prototype.getTemplateEngine = function(templateMetadata) {
	var templateFilename = templateMetadata.filename;
	var templateEngine = path.extname(templateFilename).substr('.'.length);
	return templateEngine;
};

ThemeService.prototype.getEngine = function(engineName) {
	var engine = engines[engineName];
	return engine;
};

ThemeService.prototype.getThemePath = function(themeId) {
	var themesPath = this.themesPath;
	var themePath = path.join(themesPath, themeId);
	return themePath;
};

ThemeService.prototype.getTemplatePath = function(themeId, templateId) {
	var templateMetadata = this.getTemplateMetadata(themeId, templateId);
	var templateFilename = templateMetadata.filename;
	var themePath = this.getThemePath(themeId);
	var templatePath = path.join(themePath, templateFilename);
	return templatePath;
};

ThemeService.prototype.render = function(themeId, templateId, context) {
	var self = this;
	return new Promise(function(resolve, reject) {
		var templateMetadata = self.getTemplateMetadata(themeId, templateId);
		var templateEngine = self.getTemplateEngine(templateMetadata);
		var themePath = self.getThemePath(themeId);
		var templatePath = self.getTemplatePath(themeId, templateId);
		var templateOptions = self.getTemplateOptions(templateMetadata);
		var engine = self.getEngine(templateEngine);
		var partialsRoot = (templateOptions.partials ? path.resolve(themePath, templateOptions.partials) : null);
		resolve(
			compilePartials(partialsRoot, templateEngine, engine)
				.then(function(partials) {
					var templateOptions = merge({}, templateMetadata.options, { partials: partials });
					var engineContext = merge({ '_': templateOptions }, context);
					return renderTemplate(engine, templatePath, engineContext);
				})
		);
	});
};

ThemeService.prototype.serialize = function(themeId, templateId) {
	var self = this;
	return new Promise(function(resolve, reject) {
		var templateMetadata = self.getTemplateMetadata(themeId, templateId);
		var templateEngine = self.getTemplateEngine(templateMetadata);
		var themePath = self.getThemePath(themeId);
		var templatePath = self.getTemplatePath(themeId, templateId);
		var templateOptions = self.getTemplateOptions(templateMetadata);
		var engine = self.getEngine(templateEngine);
		var partialsRoot = (templateOptions.partials ? path.resolve(themePath, templateOptions.partials) : null);
		resolve(
			serializePartials(partialsRoot, templateEngine, engine)
				.then(function(partials) {
					var serializedPartialsArray = objectValues(partials);
					return engine.serialize(templatePath, templateId)
						.then(function(serializedTemplate) {
							return serializedPartialsArray.concat(serializedTemplate).join('\n');
						});
				})
		);
	});
};

module.exports = ThemeService;


function loadPartialPaths(dirPath, engineName) {
	return loadDirectoryContents(dirPath).then(function(filenames) {
		return filenames.filter(function(filename) {
			return path.extname(filename) === '.' + engineName;
		}).map(function(filename) {
			return path.join(dirPath, filename);
		});
	});


}

function loadDirectoryContents(dirPath) {
	return new Promise(function(resolve, reject) {
		fs.readdir(dirPath, function(error, filenames) {
			if (error) { return reject(error); }
			resolve(filenames);
		});
	});
}

function getPartialName(partialPath) {
	var filename = path.basename(partialPath);
	var partialName = stripExtension(filename);
	return partialName;


	function stripExtension(filename) {
		return path.basename(filename, path.extname(filename));
	}
}

function renderTemplate(engine, templatePath, context) {
	return new Promise(function(resolve, reject) {
		engine(templatePath, context, function(error, output) {
			if (error) { return reject(error); }
			resolve(output);
		});
	});
}

function objectValues(object) {
	return Object.keys(object).map(function(key) {
		return object[key];
	});
}
