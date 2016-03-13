'use strict';

var fs = require('fs');
var path = require('path');
var copy = require('recursive-copy');
var imagemagick = require('imagemagick-native');

var loadTheme = require('./loadTheme');

var loadFileMetadata = require('../../../../src/utils/loadFileMetadata');
var resolveThemePaths = require('../../../../src/utils/resolveThemePaths');

var ThemeService = require('../../../../src/services/ThemeService');

var THEME_ASSETS_PATH = 'assets';
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

module.exports = function(themePath, outputPath, options) {
	options = options || {};
	var themeConfig = options.config;
	var themeFilesPath = options.files;

	var themeAssetsPath = path.join(themePath, THEME_ASSETS_PATH);
	var themeFiles = loadFileMetadata(themeFilesPath, {
		root: themeFilesPath,
		contents: true,
		sync: true
	});
	var theme = loadTheme(themePath);

	var themeService = new ThemeService();

	return renderThemeTemplates(theme, {
		path: themePath,
		config: themeConfig,
		files: themeFiles
	})
	.then(function(pagePreviews) {
		return Promise.all([
			savePagePreviews(pagePreviews, outputPath),
			savePreviewSiteAssets(themeFilesPath, themeAssetsPath, outputPath)
		]);
	});


	function renderThemeTemplates(theme, options) {
		options = options || {};
		var themePath = options.path;
		var themeConfig = options.config;
		var themeFiles = options.files;
		var resolvedTheme = resolveThemePaths(theme, themePath);
		return Promise.all(Object.keys(resolvedTheme.templates).map(function(templateId) {
			var templateData = getPreviewTemplateData(resolvedTheme, templateId, {
				config: themeConfig,
				files: themeFiles
			});
			return themeService.renderThemeTemplate(resolvedTheme, templateId, templateData)
				.then(function(html) {
					return {
						id: templateId,
						data: templateData,
						output: html
					};
				});
		}));


		function getPreviewTemplateData(theme, templateId, options) {
			options = options || {};
			var themeConfig = options.config;
			var themeFiles = options.files;
			var data = {
				private: false
			};
			if (templateId === 'index') {
				data.root = themeFiles;
			}
			return {
				metadata: {
					siteRoot: './',
					themeRoot: './assets/',
					theme: {
						id: theme.id,
						config: themeConfig
					}
				},
				resource: data
			};
		}
	}

	function savePagePreviews(pagePreviews, outputPreviewPath) {
		return Promise.all(
			pagePreviews.reduce(function(operations, pagePreview) {
				var templateId = pagePreview.id;
				var outputHtmlPath = path.join(outputPreviewPath, templateId + '.html');
				var outputJsonPath = path.join(outputPreviewPath, templateId + '.json');
				var previewHtml = pagePreview.output;
				var previewJson = JSON.stringify(pagePreview.data, null, 2);
				return operations.concat([
					writeFile(outputHtmlPath, previewHtml),
					writeFile(outputJsonPath, previewJson)
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
			return Promise.resolve(copy(sourcePath, outputPath, { expand: true }));
		}

		function copyDownloads(sourcePath, outputPath) {
			return Promise.resolve(copy(sourcePath, outputPath, { expand: true }));
		}

		function copyMedia(sourcePath, outputPath) {
			return Promise.resolve(copy(sourcePath, outputPath, { expand: true }));
		}

		function copyThumbnails(sourcePath, outputPath) {
			var options = {
				expand: true,
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
};

function writeFile(path, data, options) {
	return new Promise(function(resolve, reject) {
		fs.writeFile(path, data, options, function(error) {
			if (error) { return reject(error); }
			resolve();
		});
	});
}
