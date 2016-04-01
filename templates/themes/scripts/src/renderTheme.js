'use strict';

var fs = require('fs');
var stream = require('stream');
var util = require('util');
var path = require('path');
var copy = require('recursive-copy');
var imagemagick = require('imagemagick-native');
var escapeHtml = require('escape-html');

var loadTheme = require('./loadTheme');

var loadFileMetadata = require('../../../../src/utils/loadFileMetadata');
var resolveThemePaths = require('../../../../src/utils/resolveThemePaths');
var parseShortcutUrl = require('../../../../src/utils/parseShortcutUrl');

var ThemeService = require('../../../../src/services/ThemeService');

var THEME_ASSETS_PATH = 'assets';
var PREVIEW_DOWNLOADS_PATH = 'download';
var PREVIEW_REDIRECTS_PATH = 'redirect';
var PREVIEW_THUMBNAILS_PATH = 'thumbnail';
var PREVIEW_MEDIA_PATH = 'media';
var PREVIEW_ASSETS_PATH = 'assets';

var SHORTCUT_EXTENSIONS = [
	'.url',
	'.webloc',
	'.desktop'
];
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
	var analyticsConfig = options.analytics;

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
		files: themeFiles,
		analytics: analyticsConfig
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
		var rootFile = options.files;
		var analyticsConfig = options.analytics;
		var resolvedTheme = resolveThemePaths(theme, themePath);
		return Promise.all(Object.keys(resolvedTheme.templates).map(function(templateId) {
			var templateData = getPreviewTemplateData(resolvedTheme, templateId, {
				config: themeConfig,
				files: rootFile,
				analytics: analyticsConfig
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
			var analyticsConfig = options.analytics;
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
					libRoot: './assets/lib/',
					theme: {
						id: theme.id,
						config: themeConfig
					},
					analytics: analyticsConfig
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
		var outputRedirectsPath = path.join(outputPath, PREVIEW_REDIRECTS_PATH);
		var outputAssetsPath = path.join(outputPath, PREVIEW_ASSETS_PATH);
		return Promise.all([
			copyAssets(themeAssetsPath, outputAssetsPath),
			copyDownloads(previewFilesPath, outputDownloadsPath, outputRedirectsPath),
			copyThumbnails(previewFilesPath, outputThumbnailsPath),
			linkMedia(path.join('.', PREVIEW_DOWNLOADS_PATH), outputMediaPath)
		])
		.then(function(results) {
			return;
		});


		function copyAssets(sourcePath, outputPath) {
			return Promise.resolve(copy(sourcePath, outputPath, { expand: true }));
		}

		function copyDownloads(sourcePath, outputPath, redirectsPath) {
			var options = {
				expand: true,
				rename: function(src, dest, stats) {
					var extension = path.extname(src);
					var isShortcutFile = SHORTCUT_EXTENSIONS.indexOf(extension) !== -1;
					if (isShortcutFile) {
						var htmlOutputPath = path.join(
							path.relative(outputPath, redirectsPath),
							path.dirname(dest),
							swapFileExtension(src, '.html')
						);
						return htmlOutputPath;
					}
					return src;
				},
				transform: function(src, dest, stats) {
					var extension = path.extname(src);
					var isShortcutFile = SHORTCUT_EXTENSIONS.indexOf(extension) !== -1;
					if (isShortcutFile) {
						var shortcutExtension = path.extname(src);
						var shortcutType = shortcutExtension.substr('.'.length);
						return createShortcutTransformer({ type: shortcutType });
					}
					return null;
				}
			};
			return Promise.resolve(copy(sourcePath, outputPath, options));


			function createShortcutTransformer(options) {
				options = options || {};
				var shortcutType = options.type;

				function StringTransformer(transform) {
					stream.Transform.call(this);
					this._buffer = '';
					this._map = transform || function(value) { return value; };
				}

				util.inherits(StringTransformer, stream.Transform);

				StringTransformer.prototype._transform = function(chunk, enc, done) {
					this._buffer += chunk.toString();
					done();
				};

				StringTransformer.prototype._flush = function(done) {
					var output = this._map(this._buffer);
					this.push(output);
					done();
				};


				return new StringTransformer(function(value) {
					var shortcutUrl = parseShortcutUrl(value, { type: shortcutType });
					var html = renderHtmlRedirectPage(shortcutUrl);
					return html;
				});
			}

			function renderHtmlRedirectPage(url) {
				return '<html><head><meta http-equiv="refresh" content="0;URL=\'' + escapeHtml(url) + '\'"/></head></html>';
			}
		}

		function linkMedia(sourcePath, destinationPath) {
			return createSymbolicLink(sourcePath, destinationPath, { type: 'dir' });
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

function swapFileExtension(filePath, extension) {
	return path.join(path.dirname(filePath), path.basename(filePath, path.extname(filePath)) + extension);
}

function writeFile(path, data, options) {
	return new Promise(function(resolve, reject) {
		fs.writeFile(path, data, options, function(error) {
			if (error) { return reject(error); }
			resolve();
		});
	});
}

function createSymbolicLink(sourcePath, destinationPath, options) {
	options = options || {};
	var type = options.type || 'file';
	return new Promise(function(resolve, reject) {
		fs.symlink(sourcePath, destinationPath, type, function(error) {
			if (error) { return reject(error); }
			resolve();
		});
	});
}
