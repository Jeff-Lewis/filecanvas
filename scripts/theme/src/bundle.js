'use strict';

var fs = require('fs');
var path = require('path');
var http = require('http');
var async = require('async');
var del = require('del');
var mkdirp = require('mkdirp');
var copy = require('recursive-copy');
var imagemagick = require('imagemagick-native');
var Pageres = require('pageres');
var express = require('express');
var merge = require('lodash.merge');

var loadFileMetadata = require('../../../src/utils/loadFileMetadata');
var parseThemeConfigDefaults = require('../../../src/utils/parseThemeConfigDefaults');
var resolveThemePaths = require('../../../src/utils/resolveThemePaths');

var ThemeService = require('../../../src/services/ThemeService');

var THEME_MANIFEST_PATH = 'theme.json';
var THEME_THUMBNAIL_DEFAULT = 'thumbnail.png';
var THEME_SCREENSHOT_DEFAULT = 'preview.png';
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
var OUTPUT_THUMBNAIL_FILENAME = 'thumbnail.png';
var OUTPUT_SCREENSHOT_FILENAME = 'preview.png';

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
	var inputScreenshotPath = path.join(inputPath, THEME_SCREENSHOT_DEFAULT);
	var outputPreviewPath = path.join(outputPath, OUTPUT_PREVIEW_PATH);
	var outputAssetsPath = path.join(outputPath, THEME_ASSETS_PATH);
	var outputTemplatesPath = path.join(outputPath, THEME_TEMPLATES_PATH);
	var outputThumbnailFilename = path.basename(OUTPUT_THUMBNAIL_FILENAME, path.extname(OUTPUT_THUMBNAIL_FILENAME));
	var outputScreenshotFilename = path.basename(OUTPUT_SCREENSHOT_FILENAME, path.extname(OUTPUT_SCREENSHOT_FILENAME));
	var outputThemeManifestPath = path.join(outputPath, THEME_MANIFEST_PATH);

	var themeService = new ThemeService();
	log('Loading theme configuration...');
	var theme;
	try {
		theme = loadTheme(inputPath);
		theme = resolveThemePaths(theme, inputPath);
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
	Promise.all(Object.keys(theme.templates).map(function(templateId) {
		var templateData = getPreviewTemplateData(theme, templateId);
		return generateThemePreviewPage(theme, templateId, templateData).then(function(html) {
			return {
				id: templateId,
				data: templateData,
				output: html
			};
		});
	}))
	.then(function(pagePreviews) {
		log('Creating output directory at ' + outputPreviewPath);
		createDirectory(outputPreviewPath, function(error) {
			if (error) { return callback(error); }
			log('Copying preview site files to ' + outputPreviewPath);
			async.parallel(
				pagePreviews.reduce(function(operations, pagePreview) {
					var templateId = pagePreview.id;
					var outputHtmlPath = path.join(outputPreviewPath, templateId + '.html');
					var outputJsonPath = path.join(outputPreviewPath, templateId + '.json');
					var previewHtml = pagePreview.output;
					var previewJson = JSON.stringify(pagePreview.data, null, 2);
					return operations.concat([
						function(callback) { fs.writeFile(outputHtmlPath, previewHtml, callback); },
						function(callback) { fs.writeFile(outputJsonPath, previewJson, callback); }
					]);
				}, [])
				.concat(
					function(callback) { savePreviewSiteAssets(previewFilesPath, themeAssetsPath, outputPreviewPath, callback); }
				)
			, function(error, results) {
				if (error) { return callback(error); }
				log('Creating site thumbnails...');
				createSiteThumbnails({
					siteRoot: outputPreviewPath,
					outputPath: outputPath,
					resolutions: [
						{
							dimensions: { width: 1280, height: 960, scale: 200 / 1280 },
							inputPath: inputThumbnailPath,
							filename: outputThumbnailFilename
						},
						{
							dimensions: { width: 1440, height: 900, scale: 1 },
							inputPath: inputScreenshotPath,
							filename: outputScreenshotFilename
						}
					]
				}, function(error) {
					if (error) { return callback(error); }
					log('Copying theme files to ' + outputPath);
					async.parallel([
						function(callback) { copyFiles(themeAssetsPath, outputAssetsPath, callback); },
						function(callback) { copyFiles(themeTemplatesPath, outputTemplatesPath, callback); },
						function(callback) { saveThemeManifest(theme, outputThemeManifestPath, callback); }
					], function(error, results) {
						if (error) { return callback(error); }
						log('Generating precompiled theme templates...');
						createPrecompiledThemeTemplates(theme, outputTemplatesPath, function(error) {
							if (error) { return callback(error); }
							callback(null);
						});
					});
				});
			});
		});
	})
	.catch(function(error) {
		callback(error);
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
			var themeDemo = parseThemeDemo(themePath, themeConfig, themeDefaults);
			var themeFonts = themeData.fonts || null;
			var theme = {
				id: themeId,
				name: themeName,
				thumbnail: themeThumbnail,
				templates: themeTemplates,
				config: themeConfig,
				defaults: themeDefaults,
				preview: themePreview,
				demo: themeDemo,
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
				var previewConfig = extractConfigVersion(themeConfig, 'preview', themeDefaults);
				var previewFilesPath = path.join(themePath, THEME_PREVIEW_FILES_PATH);
				return {
					config: previewConfig,
					files: loadFileMetadata(previewFilesPath, {
						root: previewFilesPath,
						contents: true,
						sync: true
					})
				};
			}

			function parseThemeDemo(themePath, themeConfig, themeDefaults) {
				var demoConfig = extractConfigVersion(themeConfig, 'demo', themeDefaults);
				return {
					config: demoConfig,
					files: null
				};
			}

			function extractConfigVersion(themeConfig, key, themeDefaults) {
				var config = themeConfig.reduce(function(configValueGroups, configGroup) {
					var groupName = configGroup.name;
					var groupFields = configGroup.fields;
					var fieldValues = groupFields.reduce(function(fieldValues, configField) {
						var fieldName = configField.name;
						if (key in configField) {
							var fieldValue = configField[key];
							fieldValues[fieldName] = fieldValue;
						}
						return fieldValues;
					}, {});
					configValueGroups[groupName] = fieldValues;
					return configValueGroups;
				}, {});
				return merge({}, themeDefaults, config);
			}

			function readJson(filePath) {
				return JSON.parse(fs.readFileSync(filePath, { encoding: 'utf8' }));
			}
		}
	}

	function getPreviewTemplateData(theme, templateId) {
		var data = {
			private: false
		};
		if (templateId === 'index') {
			data.root = theme.preview.files;
		}
		return {
			metadata: {
				siteRoot: './',
				themeRoot: './assets/',
				theme: {
					id: theme.id,
					config: theme.preview.config
				}
			},
			resource: data
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

	function generateThemePreviewPage(theme, templateId, templateData) {
		return themeService.renderThemeTemplate(theme, templateId, templateData);
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
						width: 360,
						height: 360,
						resizeStyle: 'aspectfit',
						quality: 80
					});
				}
			};
			return copy(sourcePath, outputPath, options, callback);
		}
	}

	function createPrecompiledThemeTemplates(theme, templatesOutputPath, callback) {
		return Promise.all(
			Object.keys(theme.templates).map(function(templateId) {
				return themeService.serializeThemeTemplate(theme, templateId)
					.then(function(templateString) {
						var templateOutputPath = path.join(templatesOutputPath, templateId + '.js');
						return writeFile(templateOutputPath, templateString);
					});
			})
		)
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

	function createSiteThumbnails(options, callback) {
		options = options || {};
		var siteRoot = options.siteRoot;
		var outputPath = options.outputPath;
		var resolutions = options.resolutions;

		Promise.all(
			resolutions.map(function(resolution) {
				var inputPath = resolution.inputPath;
				return new Promise(function(resolve, reject) {
					checkWhetherFileExists(inputPath, function(error, fileExists) {
						if (error) { return reject(error); }
						resolve(fileExists);
					});
				});
			})
		)
		.then(function(filesExist) {
			var existingResolutions = resolutions.filter(function(resolution, index) {
				return filesExist[index];
			});
			var pendingResolutions = resolutions.filter(function(resolution, index) {
				return !filesExist[index];
			});
			return Promise.all(
				existingResolutions.map(function(resolution) {
					var inputPath = resolution.inputPath;
					var outputFilePath = path.join(outputPath, resolution.filename);

					return new Promise(function(resolve, reject) {
						log('Copying screenshot from ' + inputPath);
						copyFile(inputPath, outputFilePath, function(error) {
							if (error) { return reject(error); }
							resolve();
						});
					});
				})
				.concat(
					createScreenshots({
						siteRoot: siteRoot,
						outputPath: outputPath,
						resolutions: pendingResolutions
					})
				)
			);
		})
		.then(function(results) {
			callback(null);
		})
		.catch(function(error) {
			callback(error);
		});

		function createScreenshots(options) {
			options = options || {};
			var siteRoot = options.siteRoot;
			var outputPath = options.outputPath;
			var resolutions = options.resolutions;

			log('Saving ' + resolutions.length + ' ' + (resolutions === 1 ? 'screenshot' : 'screenshots'));
			return new Promise(function(resolve, reject) {
				log('Serving static files from ' + siteRoot);
				var server = http.createServer(express.static(siteRoot));
				var randomPort = 0;
				server.listen(randomPort, function(error) {
					if (error) { return reject(error); }
					var url = 'http://localhost:' + server.address().port + '/';
					log('Started preview server at ' + url);
					saveUrlScreenshots({
						url: url,
						outputPath: outputPath,
						resolutions: resolutions
					}, function(error) {
						if (error) { return reject(error); }
						server.close(function(error) {
							if (error) { return reject(error); }
							log('Stopped preview server');
							resolve(null);
						});
					});
				});
			});

			function saveUrlScreenshots(options, callback) {
				options = options || {};
				var url = options.url;
				var outputPath = options.outputPath;
				var resolutions = options.resolutions;
				log('Saving PhantomJS screenshots...');
				var pageres = new Pageres({ crop: true });
				resolutions.reduce(function(pageres, resolution) {
					return pageres.src(url, [resolution.dimensions.width + 'x' + resolution.dimensions.height], {
						scale: resolution.dimensions.scale,
						filename: resolution.filename
					});
				}, pageres)
				.dest(outputPath)
				.run()
				.then(function() {
					log('Saved PhantomJS screenshot');
					callback(null);
				})
				.catch(function(error) {
					callback(error);
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
