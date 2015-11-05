'use strict';

var fs = require('fs');
var path = require('path');
var mapSeries = require('promise-map-series');
var junk = require('junk');
var mime = require('mime');
var Mode = require('stat-mode');

var FileModel = require('../models/FileModel');

module.exports = function(filePath, options) {
	options = options || {};
	var rootPath = options.root || null;
	var includeContents = Boolean(options.contents);
	return loadFileMetadata(filePath, rootPath, includeContents);
};

function loadFileMetadata(filePath, rootPath, includeContents) {
	return new Promise(function(resolve, reject) {
		fs.stat(filePath, function(error, stat) {
			if (error) { return reject(error); }
			var relativePath = filePath.replace(rootPath, '') || '/';
			var fileModel = parseStatModel(stat, relativePath);
			if (stat.isDirectory() && includeContents) {
				loadFolderContents(filePath, rootPath)
				.then(function(files) {
					fileModel.contents = files;
					return fileModel;
				})
				.then(function(fileModel) {
					resolve(fileModel);
				})
				.catch(function(error) {
					reject(error);
				});
			} else {
				return resolve(fileModel);
			}
		});
	});
}

function loadFolderContents(folderPath, rootPath) {
	return new Promise(function(resolve, reject) {
		fs.readdir(folderPath, function(error, filenames) {
			if (error) { return reject(error); }
			filenames = filenames.filter(junk.not);
			mapSeries(filenames, function(filename) {
				var filePath = path.join(folderPath, filename);
				var includeContents = true;
				return loadFileMetadata(filePath, rootPath, includeContents);
			})
			.then(function(files) {
				resolve(files);
			})
			.catch(function(error) {
				reject(error);
			});
		});
	});
}

function parseStatModel(stat, filePath) {
	var mimeType = stat.isFile() ? mime.lookup(filePath) : null;
	var hasThumbnail = Boolean(mimeType) && mimeType.split('/')[0] === 'image';
	var ownerCanWrite = new Mode(stat).owner.write;
	var isDirectory = stat.isDirectory();
	var fileMetadata = {
		path: filePath,
		mimeType: mimeType,
		size: stat.size,
		modified: stat.mtime.toUTCString(),
		readOnly: !ownerCanWrite,
		thumbnail: hasThumbnail,
		directory: isDirectory
	};
	return new FileModel(fileMetadata);
}
