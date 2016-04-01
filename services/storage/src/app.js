'use strict';

var path = require('path');
var express = require('express');
var mkdirp = require('mkdirp');

var uploader = require('./middleware/uploader');
var thumbnailer = require('./middleware/thumbnailer');
var generateTempPath = require('./utils/generateTempPath');

var tempPath = generateTempPath('filecanvas');

module.exports = function(options) {
	options = options || {};
	var sitesPath = options.sites || path.join(tempPath, 'sites');
	var demoAssetsPath = options.demoAssets || path.join(tempPath, 'demo-assets');
	var themeAssetsPath = options.themeAssets || path.join(tempPath, 'theme-assets');
	var thumbnailsPath = path.join(tempPath, 'thumbnails');
	var thumbnailWidth = options.thumbnailWidth || 360;
	var thumbnailHeight = options.thumbnailHeight || 360;
	var thumbnailFormat = options.thumbnailFormat || null;
	console.log(sitesPath);

	ensureDirectoryExists(sitesPath);
	ensureDirectoryExists(demoAssetsPath);
	ensureDirectoryExists(themeAssetsPath);
	ensureDirectoryExists(thumbnailsPath);

	var app = express();

	var sitesUploadMiddleware = uploader(sitesPath);
	var sitesDownloadMiddleware = express.static(sitesPath, { redirect: false });
	var sitesThumbnailMiddleware = thumbnailer(sitesPath, {
		width: thumbnailWidth,
		height: thumbnailHeight,
		format: thumbnailFormat,
		cache: thumbnailsPath
	});
	var demoAssetUploadMiddleware = uploader(demoAssetsPath);
	var demoAssetDownloadMiddleware = express.static(demoAssetsPath, { redirect: false });
	var themeAssetUploadMiddleware = uploader(themeAssetsPath);
	var themeAssetDownloadMiddleware = express.static(themeAssetsPath, { redirect: false });

	app.use('/sites/upload', sitesUploadMiddleware);
	app.use('/sites/download', contentDispositionMiddleware('attachment'), sitesDownloadMiddleware);
	app.use('/sites/media', contentDispositionMiddleware('inline'), sitesDownloadMiddleware);
	app.use('/sites/thumbnail', sitesThumbnailMiddleware);

	app.use('/demo-assets/upload', demoAssetUploadMiddleware);
	app.use('/demo-assets/download', demoAssetDownloadMiddleware);

	app.use('/theme-assets/upload', themeAssetUploadMiddleware);
	app.use('/theme-assets/download', themeAssetDownloadMiddleware);

	return app;
};


function contentDispositionMiddleware(disposition) {
	return function(req, res, next) {
		var filename = decodeURIComponent(path.basename(req.originalUrl));
		res.setHeader('Content-disposition', disposition + '; filename="' + filename + '";');
		next();
	};
}

function ensureDirectoryExists(path) {
	mkdirp.sync(path);
}
