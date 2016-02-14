'use strict';

var fs = require('fs');
var path = require('path');
var http = require('http');
var async = require('async');
var del = require('del');
var mkdirp = require('mkdirp');
var copy = require('recursive-copy');
var imagemagick = require('imagemagick-native');
var webshot = require('webshot');
var express = require('express');
var merge = require('lodash.merge');

var loadFileMetadata = require('../../../src/utils/loadFileMetadata');
var parseThemeConfigDefaults = require('../../../src/utils/parseThemeConfigDefaults');
var resolveThemePaths = require('../../../src/utils/resolveThemePaths');

var ThemeService = require('../../../src/services/ThemeService');

var THEME_MANIFEST_PATH = 'theme.json';
var THEME_THUMBNAIL_DEFAULT = 'thumbnail.png';
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
var THEME_TEMPLATES_PATH = 'templates';
var THEME_PREVIEW_FILES_PATH = 'preview';
var THEME_ASSETS_PATH = 'assets';
var OUTPUT_PREVIEW_PATH = 'preview';
var OUTPUT_THUMBNAIL_PATH = 'thumbnail.png';
var PRECOMPILED_INDEX_TEMPLATE_PATH = 'index.js';

var PREVIEW_TEMPLATE_ID = 'index';
var PREVIEW_PAGE_FILENAME = 'index.html';
var PREVIEW_DATA_FILENAME = 'index.json';
var PREVIEW_DOWNLOADS_PATH = 'download';
var PREVIEW_THUMBNAILS_PATH = 'thumbnail';
var PREVIEW_MEDIA_PATH = 'media';
var PREVIEW_ASSETS_PATH = 'assets';


var THUMBNAIL_EXTENSIONS = [
	'.jpg',
	'.jpeg',
	'.gif',
	'.png'
];

module.exports = function(inputPath, outputPath, options, callback) {
	if ((arguments.length === 3) && (typeof options === 'function')) {
		callback = options;
		options = null;
	}
	options = options || {};
	var log = options.log || function(message) { };

	var previewFilesPath = path.join(inputPath, THEME_PREVIEW_FILES_PATH);
	var themeAssetsPath = path.join(inputPath, THEME_ASSETS_PATH);
	var themeTemplatesPath = path.join(inputPath, THEME_TEMPLATES_PATH);
	var inputThumbnailPath = path.join(inputPath, THEME_THUMBNAIL_DEFAULT);
	var outputPreviewPath = path.join(outputPath, OUTPUT_PREVIEW_PATH);
	var outputPreviewPagePath = path.join(outputPreviewPath, PREVIEW_PAGE_FILENAME);
	var outputPreviewDataPath = path.join(outputPreviewPath, PREVIEW_DATA_FILENAME);
	var outputAssetsPath = path.join(outputPath, THEME_ASSETS_PATH);
	var outputTemplatesPath = path.join(outputPath, THEME_TEMPLATES_PATH);
	var outputThumbnailPath = path.join(outputPath, OUTPUT_THUMBNAIL_PATH);
	var outputThemeManifestPath = path.join(outputPath, THEME_MANIFEST_PATH);
	var precompiledIndexTemplatePath = path.join(outputTemplatesPath, PRECOMPILED_INDEX_TEMPLATE_PATH);
	var previewTemplateId = PREVIEW_TEMPLATE_ID;

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
	log('Generating theme preview page...');
	var resolvedTheme = resolveThemePaths(theme, inputPath);
	var previewTemplateData = getPreviewTemplateData(theme);
	generateThemePreviewPage(resolvedTheme, previewTemplateId, previewTemplateData, function(error, previewHtml) {
		if (error) { return callback(error); }
		log('Creating output directory at ' + outputPreviewPath);
		createDirectory(outputPreviewPath, function(error) {
			if (error) { return callback(error); }
			log('Copying preview site files to ' + outputPreviewPath);
			async.parallel([
				function(callback) { fs.writeFile(outputPreviewPagePath, previewHtml, callback); },
				function(callback) { fs.writeFile(outputPreviewDataPath, JSON.stringify(previewTemplateData, null, 2), callback); },
				function(callback) { savePreviewSiteAssets(previewFilesPath, themeAssetsPath, outputPreviewPath, callback); }
			], function(error, results) {
				if (error) { return callback(error); }
				log('Creating site thumbnail...');
				createSiteThumbnail(inputThumbnailPath, outputPreviewPath, outputThumbnailPath, function(error) {
					if (error) { return callback(error); }
					log('Copying theme files to ' + outputPath);
					async.parallel([
						function(callback) { copyFiles(themeAssetsPath, outputAssetsPath, callback); },
						function(callback) { copyFiles(themeTemplatesPath, outputTemplatesPath, callback); },
						function(callback) { saveThemeManifest(theme, outputThemeManifestPath, callback); }
					], function(error, results) {
						if (error) { return callback(error); }
						log('Generating precompiled theme template...');
						createPrecompiledThemeTemplate(resolvedTheme, previewTemplateId, precompiledIndexTemplatePath, function(error) {
							if (error) { return callback(error); }
							callback(null);
						});
					});
				});
			});
		});
	});


	function loadTheme(themePath) {
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
			var themePreview = parseThemePreview(themePath, themeConfig, themeDefaults);
			var themeFonts = themeData.fonts || null;
			var theme = {
				id: themeId,
				name: themeName,
				thumbnail: themeThumbnail,
				templates: themeTemplates,
				config: themeConfig,
				defaults: themeDefaults,
				preview: themePreview,
				fonts: themeFonts
			};
			return theme;


			function parseThemeThumbnail(thumbnailPath) {
				return thumbnailPath || THEME_THUMBNAIL_DEFAULT;
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

			function parseThemePreview(themePath, themeConfig, themeDefaults) {
				var previewConfig = extractPreviewConfig(themeConfig, themeDefaults);
				var previewFilesPath = path.join(themePath, THEME_PREVIEW_FILES_PATH);
				return {
					config: previewConfig,
					files: loadFileMetadata(previewFilesPath, {
						root: previewFilesPath,
						contents: true,
						sync: true
					})
				};

				function extractPreviewConfig(themeConfig, themeDefaults) {
					var previewConfig = themeConfig.reduce(function(configValueGroups, configGroup) {
						var groupName = configGroup.name;
						var groupFields = configGroup.fields;
						var fieldValues = groupFields.reduce(function(fieldValues, configField) {
							var fieldName = configField.name;
							if ('preview' in configField) {
								var fieldValue = configField.preview;
								fieldValues[fieldName] = fieldValue;
							}
							return fieldValues;
						}, {});
						configValueGroups[groupName] = fieldValues;
						return configValueGroups;
					}, {});
					return merge({}, themeDefaults, previewConfig);
				}
			}

			function readJson(filePath) {
				return JSON.parse(fs.readFileSync(filePath, { encoding: 'utf8' }));
			}
		}
	}

	function getPreviewTemplateData(theme) {
		return {
			metadata: {
				siteRoot: './',
				themeRoot: './assets/',
				theme: {
					id: theme.id,
					config: theme.preview.config
				}
			},
			resource: {
				private: false,
				root: theme.preview.files
			}
		};
	}

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
		if (!theme.preview) {
			errors.push(new Error('Missing preview configuration'));
		}
		var ALLOWED_FIELDS = [
			'id',
			'name',
			'templates',
			'config',
			'defaults',
			'preview',
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

	function generateThemePreviewPage(theme, templateId, templateData, callback) {
		themeService.renderThemeTemplate(theme, templateId, templateData)
			.then(function(html) {
				callback(null, html);
			})
			.catch(function(error) {
				callback(error);
			});
	}

	function createDirectory(path, callback) {
		fs.stat(path, function(error, stats) {
			if (error && (error.code === 'ENOENT')) {
				return mkdirp(path, callback);
			}
			if (error) { return callback(error); }
			if (!stats.isDirectory()) {
				return callback(new Error('File exists: ' + path));
			}
			fs.readdir(path, function(error, files) {
				if (error) { return callback(error); }
				if (files.length > 0) {
					return callback(new Error('Directory is not empty: ' + path));
				}
				return callback(null);
			});
		});
	}

	function savePreviewSiteAssets(previewFilesPath, themeAssetsPath, outputPath, callback) {
		var outputDownloadsPath = path.join(outputPath, PREVIEW_DOWNLOADS_PATH);
		var outputThumbnailsPath = path.join(outputPath, PREVIEW_THUMBNAILS_PATH);
		var outputMediaPath = path.join(outputPath, PREVIEW_MEDIA_PATH);
		var outputAssetsPath = path.join(outputPath, PREVIEW_ASSETS_PATH);
		async.parallel([
			function(callback) { copyFiles(previewFilesPath, outputDownloadsPath, callback); },
			function(callback) { copyMedia(previewFilesPath, outputMediaPath, callback); },
			function(callback) { copyThumbnails(previewFilesPath, outputThumbnailsPath, callback); },
			function(callback) { copyFiles(themeAssetsPath, outputAssetsPath, callback); }
		], function(error, results) {
			if (error) {
				return del(outputPath)
					.then(function() {
						return callback(error);
					})
					.catch(function() {
						return callback(error);
					});
			}
			callback(null);
		});


		function copyMedia(sourcePath, outputPath, callback) {
			return copyFiles(sourcePath, outputPath, callback);
		}

		function copyThumbnails(sourcePath, outputPath, callback) {
			var options = {
				filter: function(filePath) {
					var extension = path.extname(filePath);
					var isThumbnailEnabled = THUMBNAIL_EXTENSIONS.indexOf(extension) !== -1;
					return isThumbnailEnabled;
				},
				transform: function(src, dest, stats) {
					return imagemagick.streams.convert({
						width: 256,
						height: 256,
						resizeStyle: 'aspectfit',
						quality: 80
					});
				}
			};
			return copy(sourcePath, outputPath, options, callback);
		}
	}

	function createPrecompiledThemeTemplate(theme, templateId, outputPath, callback) {
		themeService.serializeThemeTemplate(theme, templateId)
			.then(function(templateString) {
				return writeFile(outputPath, templateString);
			})
			.then(function() {
				callback(null);
			})
			.catch(function(error) {
				callback(error);
			});


		function writeFile(path, data) {
			return new Promise(function(resolve, reject) {
				fs.writeFile(path, data, function(error) {
					if (error) { return reject(error); }
					resolve();
				});
			});
		}
	}

	function createSiteThumbnail(thumbnailPath, previewPath, outputPath, callback) {
		checkWhetherFileExists(inputThumbnailPath, function(error, hasThumbnail) {
			if (error) { return callback(error); }
			if (hasThumbnail) {
				log('Copying thumbnail from ' + thumbnailPath);
				copyFile(inputThumbnailPath, outputThumbnailPath, function(error) {
					callback(null);
					return;
				});
			} else {
				log('Saving theme screenshot');
				savePreviewThumbnail(outputPreviewPath, outputThumbnailPath, function(error) {
					if (error) { return callback(error); }
					callback(null);
				});
			}
		});


		function savePreviewThumbnail(sitePath, outputPath, callback) {
			log('Serving static files from ' + sitePath);
			var server = http.createServer(express.static(sitePath));
			var randomPort = 0;
			server.listen(randomPort, function(error) {
				if (error) { return callback(error); }
				var url = 'http://localhost:' + server.address().port + '/';
				log('Started preview server at ' + url);
				saveUrlScreenshot(url, outputPath, function(error) {
					if (error) { return callback(error); }
					server.close(function(error) {
						if (error) { return callback(error); }
						log('Stopped preview server');
						callback(null);
					});
				});
			});

			function saveUrlScreenshot(url, outputPath, callback) {
				log('Saving PhantomJS screenshot...');
				webshot(url, {
					windowSize: { width: 1280, height: 960 },
					shotSize: { width: 'window', height: 'window' },
					defaultWhiteBackground: true,
					timeout: 60 * 1000
				})
				.on('error', callback)
				.pipe(imagemagick.streams.convert({ width: 200, height: 150, format: 'PNG' }))
				.on('error', callback)
				.pipe(fs.createWriteStream(outputPath))
				.on('error', callback)
				.on('finish', function() {
					log('Saved PhantomJS screenshot');
					callback(null);
				});
			}
		}
	}

	function saveThemeManifest(theme, filePath, callback) {
		var json = JSON.stringify(theme, null, 2);
		fs.writeFile(filePath, json, callback);
	}

	function checkWhetherFileExists(path, callback) {
		fs.stat(path, function(error, stats) {
			if (error && (error.code === 'ENOENT')) {
				return callback(null, false);
			}
			if (error) { return callback(error); }
			if (!stats.isFile()) { return callback(null, false); }
			return callback(null, true);
		});
	}

	function copyFiles(sourcePath, outputPath, callback) {
		return copy(sourcePath, outputPath, {
			expand: true
		}, callback);
	}

	function copyFile(inputPath, outputPath, callback) {
		fs.createReadStream(inputPath)
			.on('error', callback)
			.pipe(fs.createWriteStream(outputPath))
			.on('error', callback)
			.on('finish', function() {
				callback(null);
			});
	}
};
