'use strict';

var fs = require('fs');
var path = require('path');
var http = require('http');
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
	ensureEmptyDirectoryExists(outputPreviewPath)
		.then(function() {
			log('Generating theme preview pages...');
			return renderThemeTemplates(theme, inputPath);
		})
		.then(function(pagePreviews) {
			log('Copying theme files to ' + outputPath);
			return ensureEmptyDirectoryExists(outputTemplatesPath)
				.then(function() {
					return Promise.all([
						savePagePreviews(pagePreviews, outputPreviewPath, outputTemplatesPath),
						savePreviewSiteAssets(previewFilesPath, themeAssetsPath, outputPreviewPath),
						copyFiles(themeAssetsPath, outputAssetsPath),
						copyFiles(themeTemplatesPath, outputTemplatesPath),
						saveThemeManifest(theme, outputThemeManifestPath),
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
						})
					])
					.then(function(results) {
						return;
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

	function ensureEmptyDirectoryExists(path) {
		return retrieveStats(path)
			.then(function(stats) {
				if (!stats) {
					return createDirectory(path);
				}
				if (!stats.isDirectory()) {
					throw new Error('File exists: ' + path);
				}
				return readDirectoryContents(path)
					.then(function(files) {
						if (files.length > 0) {
							throw new Error('Directory is not empty: ' + path);
						}
					});
			});

		function retrieveStats(path) {
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

		function createDirectory(path) {
			return new Promise(function(resolve, reject) {
				mkdirp(path, function(error) {
					if (error) { return reject(error); }
					resolve();
				});
			});
		}

		function readDirectoryContents(path) {
			return new Promise(function(resolve, reject) {
				fs.readdir(path, function(error, files) {
					if (error) { return reject(error); }
					return resolve(files);
				});
			});
		}

	}

	function renderThemeTemplates(theme) {
		var resolvedTheme = resolveThemePaths(theme, inputPath);
		return Promise.all(Object.keys(resolvedTheme.templates).map(function(templateId) {
			var templateData = getPreviewTemplateData(resolvedTheme, templateId);
			return themeService.renderThemeTemplate(resolvedTheme, templateId, templateData)
				.then(function(html) {
					return themeService.serializeThemeTemplate(resolvedTheme, templateId)
						.then(function(templateString) {
							return {
								id: templateId,
								template: templateString,
								data: templateData,
								output: html
							};
						});
				});
		}));


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
	}

	function savePagePreviews(pagePreviews, outputPreviewPath, outputTemplatesPath) {
		return Promise.all(
			pagePreviews.reduce(function(operations, pagePreview) {
				var templateId = pagePreview.id;
				var outputHtmlPath = path.join(outputPreviewPath, templateId + '.html');
				var outputJsonPath = path.join(outputPreviewPath, templateId + '.json');
				var outputTemplatePath = path.join(outputTemplatesPath, templateId + '.js');
				var templateString = pagePreview.template;
				var previewHtml = pagePreview.output;
				var previewJson = JSON.stringify(pagePreview.data, null, 2);
				return operations.concat([
					writeFile(outputHtmlPath, previewHtml),
					writeFile(outputJsonPath, previewJson),
					writeFile(outputTemplatePath, templateString)
				]);
			}, [])
		).then(function(results) {
			return;
		});
	}

	function savePreviewSiteAssets(previewFilesPath, themeAssetsPath, outputPath) {
		var outputDownloadsPath = path.join(outputPath, PREVIEW_DOWNLOADS_PATH);
		var outputThumbnailsPath = path.join(outputPath, PREVIEW_THUMBNAILS_PATH);
		var outputMediaPath = path.join(outputPath, PREVIEW_MEDIA_PATH);
		var outputAssetsPath = path.join(outputPath, PREVIEW_ASSETS_PATH);
		return Promise.all([
			copyAssets(themeAssetsPath, outputAssetsPath),
			copyDownloads(previewFilesPath, outputDownloadsPath),
			copyMedia(previewFilesPath, outputMediaPath),
			copyThumbnails(previewFilesPath, outputThumbnailsPath)
		])
		.then(function(results) {
			return;
		});


		function copyAssets(sourcePath, outputPath) {
			return copyFiles(sourcePath, outputPath);
		}

		function copyDownloads(sourcePath, outputPath) {
			return copyFiles(sourcePath, outputPath);
		}

		function copyMedia(sourcePath, outputPath) {
			return copyFiles(sourcePath, outputPath);
		}

		function copyThumbnails(sourcePath, outputPath) {
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
			return Promise.resolve(copy(sourcePath, outputPath, options));
		}
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

	function createSiteThumbnails(options) {
		options = options || {};
		var siteRoot = options.siteRoot;
		var outputPath = options.outputPath;
		var resolutions = options.resolutions;

		return Promise.all(
			resolutions.map(function(resolution) {
				var inputPath = resolution.inputPath;
				return checkWhetherFileExists(inputPath)
					.then(function(fileExists) {
						return fileExists;
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
					log('Copying screenshot from ' + inputPath);
					return copyFile(inputPath, outputFilePath);
				})
				.concat(
					createScreenshots({
						siteRoot: siteRoot,
						outputPath: outputPath,
						resolutions: pendingResolutions
					})
				)
			)
			.then(function(results) {
				return;
			});
		});


		function createScreenshots(options) {
			options = options || {};
			var siteRoot = options.siteRoot;
			var outputPath = options.outputPath;
			var resolutions = options.resolutions;

			log('Saving ' + resolutions.length + ' ' + (resolutions === 1 ? 'screenshot' : 'screenshots'));
			log('Serving static files from ' + siteRoot);
			return launchStaticServer(siteRoot)
				.then(function(server) {
					var url = 'http://localhost:' + server.address().port + '/';
					log('Started preview server at ' + url);
					return saveUrlScreenshots({
						url: url,
						outputPath: outputPath,
						resolutions: resolutions
					})
						.then(function() {
							return stopServer(server);
						})
						.then(function() {
							log('Stopped preview server');
							return;
						});
				});


			function launchStaticServer(siteRoot) {
				return new Promise(function(resolve, reject) {
					var server = http.createServer(express.static(siteRoot));
					var randomPort = 0;
					server.listen(randomPort, function(error) {
						if (error) { return reject(error); }
						resolve(server);
					});
				});
			}

			function stopServer(server) {
				return new Promise(function(resolve, reject) {
					server.close(function(error) {
						if (error) { return reject(error); }
						resolve();
					});
				});
			}

			function saveUrlScreenshots(options) {
				options = options || {};
				var url = options.url;
				var outputPath = options.outputPath;
				var resolutions = options.resolutions;
				log('Saving PhantomJS screenshots...');
				var pageres = new Pageres({ crop: true });
				return resolutions.reduce(function(pageres, resolution) {
					return pageres.src(url, [resolution.dimensions.width + 'x' + resolution.dimensions.height], {
						scale: resolution.dimensions.scale,
						filename: resolution.filename
					});
				}, pageres)
					.dest(outputPath)
					.run()
					.then(function() {
						log('Saved PhantomJS screenshot');
						return;
					});
			}
		}
	}

	function saveThemeManifest(theme, filePath) {
		var json = JSON.stringify(theme, null, 2);
		return writeFile(filePath, json);
	}

	function checkWhetherFileExists(path) {
		return new Promise(function(resolve, reject) {
			fs.stat(path, function(error, stats) {
				if (error && (error.code === 'ENOENT')) {
					return resolve(false);
				}
				if (error) { return reject(error); }
				if (!stats.isFile()) { return resolve(false); }
				return resolve(true);
			});
		});
	}

	function copyFiles(sourcePath, outputPath) {
		return Promise.resolve(copy(sourcePath, outputPath, {
			expand: true
		}));
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
};
