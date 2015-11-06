'use strict';

var path = require('path');
var express = require('express');
var pathExists = require('path-exists');
var isPathInside = require('is-path-inside');

var HttpError = require('../errors/HttpError');

var ThumbnailService = require('../services/ThumbnailService');

module.exports = function(root, options) {
	options = options || {};
	var width = options.width || null;
	var height = options.height || null;
	var cachePath = options.cache || null;
	var format = options.format || null;

	if (!root) { throw new Error('Missing source path'); }
	if (!width) { throw new Error('Missing thumbnail width'); }
	if (!height) { throw new Error('Missing thumbnail height'); }
	if (!cachePath) { throw new Error('Missing thumbnail cache path'); }

	var staticMiddleware = express.static(path.resolve(cachePath));
	var cachedPaths = {};
	return function(req, res, next) {
		var imagePath = stripLeadingSlash(decodeURIComponent(req.url));
		var isOutsideRoot = !isPathInside(path.resolve(root, imagePath), root);
		if (isOutsideRoot) {
			return next(new HttpError(404));
		}
		processThumbnail(imagePath, cachedPaths)
			.then(function(outputImagePath) {
				req.url = outputImagePath;
				staticMiddleware(req, res, next);
			})
			.catch(function(error) {
				next(error);
			});
	};


	function stripLeadingSlash(string) {
		return string.substr('/'.length);
	}

	function processThumbnail(imagePath, cachedPaths) {
		var isAlreadyProcessed = imagePath in cachedPaths;
		var outputImagePath = imagePath;
		if (format) {
			var extension = '.' + format;
			outputImagePath = path.join(path.dirname(imagePath), path.basename(imagePath, path.extname(imagePath)) + extension);
		}
		if (isAlreadyProcessed) { return Promise.resolve(outputImagePath); }
		var source = path.resolve(root, imagePath);
		var destination = path.resolve(cachePath, outputImagePath);
		return createThumbnail(source, {
			width: width,
			height: height,
			destination: destination
		})
		.then(function() {
			cachedPaths[imagePath] = true;
			return outputImagePath;
		});
	}

	function createThumbnail(imagePath, options) {
		options = options || {};
		var width = options.width;
		var height = options.height;
		var destination = options.destination;
		return pathExists(imagePath)
			.then(function(exists) {
				if (!exists) { throw new HttpError(404); }
			})
			.then(function() {
				return new ThumbnailService().saveThumbnail(imagePath, {
					destination: destination,
					width: width,
					height: height
				});
			});
	}
};
