'use strict';

var fs = require('fs');
var path = require('path');
var copy = require('recursive-copy');
var merge = require('lodash.merge');

var loadTheme = require('./loadTheme');
var ensureEmptyDirectoryExists = require('./ensureEmptyDirectoryExists');
var pluckThemeConfigVersion = require('./pluckThemeConfigVersion');
var renderTheme = require('./renderTheme');
var captureSiteThumbnail = require('./captureSiteThumbnail');

var resolveThemePaths = require('../../../../src/utils/resolveThemePaths');

var ThemeService = require('../../../../src/services/ThemeService');

var THEME_TEMPLATES_PATH = 'templates';
var THEME_ASSETS_PATH = 'assets';
var THEME_PREVIEW_FILES_PATH = 'preview';
var THEME_THUMBNAIL_PATH = 'thumbnail.png';

var OUTPUT_THEME_MANIFEST_PATH = 'theme.json';
var OUTPUT_TEMPLATES_PATH = 'templates';
var OUTPUT_PREVIEW_PATH = 'preview';
var OUTPUT_ASSETS_PATH = 'assets';
var OUTPUT_THUMBNAIL_FILENAME = 'thumbnail.png';


module.exports = function(inputPath, outputPath, options, callback) {
	if ((arguments.length === 3) && (typeof options === 'function')) {
		callback = options;
		options = null;
	}
	options = options || {};
	var log = options.log || function(message) { };
	var shouldExpandSymlinks = options.expandSymlinks;

	var previewFilesPath = path.join(inputPath, THEME_PREVIEW_FILES_PATH);
	var themeAssetsPath = path.join(inputPath, THEME_ASSETS_PATH);
	var themeTemplatesPath = path.join(inputPath, THEME_TEMPLATES_PATH);
	var inputThumbnailPath = path.join(inputPath, THEME_THUMBNAIL_PATH);
	var outputPreviewPath = path.join(outputPath, OUTPUT_PREVIEW_PATH);
	var outputAssetsPath = path.join(outputPath, OUTPUT_ASSETS_PATH);
	var outputTemplatesPath = path.join(outputPath, OUTPUT_TEMPLATES_PATH);
	var outputThumbnailPath = path.join(outputPath, OUTPUT_THUMBNAIL_FILENAME);
	var outputThemeManifestPath = path.join(outputPath, OUTPUT_THEME_MANIFEST_PATH);

	var themeService = new ThemeService();
	log('Loading theme configuration...');
	var theme;
	try {
		theme = loadTheme(inputPath);
	} catch(error) {
		process.nextTick(function() {
			callback(error);
		});
		return;
	}
	log('Validating theme configuration...');
	var validationErrors = getThemeValidationErrors(theme);
	if (validationErrors && (validationErrors.length > 0)) {
		process.nextTick(function() {
			var combinedErrorMessage = validationErrors.map(function(error) { return '- ' + error.message; }).join('\n');
			var error = new Error('Validation failed:\n' + combinedErrorMessage);
			callback(error);
		});
		return;
	}
	log('Creating output directory at ' + outputPreviewPath);
	log('Creating output directory at ' + outputTemplatesPath);
	Promise.all([
		ensureEmptyDirectoryExists(outputPreviewPath),
		ensureEmptyDirectoryExists(outputTemplatesPath)
	])
		.then(function() {
			log('Generating theme preview pages...');
			var previewConfig = merge({}, theme.defaults, pluckThemeConfigVersion(theme.config, 'preview'));
			return renderTheme(inputPath, outputPreviewPath, {
				config: previewConfig,
				files: previewFilesPath
			});
		})
		.then(function() {
			log('Copying theme files to ' + outputPath);
			return Promise.all([
				copy(themeAssetsPath, outputAssetsPath, { expand: shouldExpandSymlinks }),
				copy(themeTemplatesPath, outputTemplatesPath, { expand: shouldExpandSymlinks }),
				saveThemeManifest(theme, outputThemeManifestPath)
			])
			.then(function(results) {
				return checkWhetherFileExists(inputThumbnailPath)
					.then(function(fileExists) {
						if (fileExists) {
							return copyFile(inputThumbnailPath, outputThumbnailPath);
						} else {
							return captureSiteThumbnail({
								siteRoot: outputPreviewPath,
								outputPath: outputThumbnailPath,
								dimensions: { width: 1280, height: 960 },
								resize: { width: 200, height: 150 },
								log: log
							});
						}
					});
			});
		})
		.then(function() {
			return createPrecompiledThemeTemplates(theme, outputTemplatesPath);
		})
		.then(function() {
			callback(null);
		})
		.catch(function(error) {
			callback(error);
		});


	function getThemeValidationErrors(theme) {
		var errors = [];
		if (!theme.name) {
			errors.push(new Error('Missing theme name'));
		}
		if (!theme.templates) {
			errors.push(new Error('Missing theme templates'));
		}
		if (!theme.templates.index) {
			errors.push(new Error('Missing index template'));
		}
		if (!theme.templates.login) {
			errors.push(new Error('Missing login template'));
		}
		if (!theme.config) {
			errors.push(new Error('Missing theme configuration'));
		}
		if (!theme.defaults) {
			errors.push(new Error('Missing default configuration'));
		}
		if (!theme.demo) {
			errors.push(new Error('Missing demo configuration'));
		}
		var ALLOWED_FIELDS = [
			'id',
			'name',
			'templates',
			'config',
			'defaults',
			'preview',
			'demo',
			'thumbnail',
			'fonts'
		];
		Object.keys(theme).forEach(function(fieldName) {
			if (ALLOWED_FIELDS.indexOf(fieldName) === -1) {
				errors.push(new Error('Invalid field: ' + fieldName));
			}
		});
		// TODO: Verify theme config
		return (errors.length > 0 ? errors : null);
	}

	function createPrecompiledThemeTemplates(theme, templatesOutputPath) {
		var resolvedTheme = resolveThemePaths(theme, inputPath);
		return Promise.all(
			Object.keys(resolvedTheme.templates).map(function(templateId) {
				return themeService.serializeThemeTemplate(resolvedTheme, templateId)
					.then(function(templateString) {
						var templateOutputPath = path.join(templatesOutputPath, templateId + '.js');
						return writeFile(templateOutputPath, templateString);
					});
			})
		)
			.then(function(results) {
				return;
			});
	}

	function saveThemeManifest(theme, filePath) {
		var json = JSON.stringify(theme, null, 2);
		return writeFile(filePath, json);
	}
};

function checkWhetherFileExists(path) {
	return retrieveFileStats(path)
		.then(function(stats) {
			if (!stats) { return false; }
			if (!stats.isFile()) { return false; }
			return true;
		});
}

function retrieveFileStats(path) {
	return new Promise(function(resolve, reject) {
		fs.stat(path, function(error, stats) {
			if (error && (error.code === 'ENOENT')) {
				return resolve(null);
			}
			if (error) { return reject(error); }
			resolve(stats);
		});
	});
}

function copyFile(inputPath, outputPath) {
	return new Promise(function(resolve, reject) {
		fs.createReadStream(inputPath)
			.on('error', reject)
			.pipe(fs.createWriteStream(outputPath))
			.on('error', reject)
			.on('finish', function() {
				resolve();
			});
	});
}

function writeFile(path, data, options) {
	return new Promise(function(resolve, reject) {
		fs.writeFile(path, data, options, function(error) {
			if (error) { return reject(error); }
			resolve();
		});
	});
}
