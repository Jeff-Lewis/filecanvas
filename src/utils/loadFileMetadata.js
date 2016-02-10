'use strict';

var fs = require('fs');
var path = require('path');
var mapSeries = require('promise-map-series');
var junk = require('junk');
var mime = require('mime');

var FileModel = require('../models/FileModel');

module.exports = function(filePath, options) {
	options = options || {};
	var rootPath = options.root || null;
	var sync = Boolean(options.sync);
	var includeContents = Boolean(options.contents);
	if (sync) {
		return loadFileMetadataSync(filePath, rootPath, includeContents);
	} else {
		return loadFileMetadata(filePath, rootPath, includeContents);
	}
};

function loadFileMetadataSync(filePath, rootPath, includeContents) {
	var stat = fs.statSync(filePath);
	var relativePath = getRelativePath(filePath, rootPath);
	var fileModel = parseStatModel(stat, relativePath);
	if (stat.isDirectory() && includeContents) {
		fileModel.contents = loadFolderContentsSync(filePath, rootPath);
	}
	return fileModel;


	function loadFolderContentsSync(folderPath, rootPath) {
		var filenames = fs.readdirSync(folderPath);
		filenames = filenames.filter(junk.not);
		return filenames.map(function(filename) {
			var filePath = path.join(folderPath, filename);
			var includeContents = true;
			return loadFileMetadataSync(filePath, rootPath, includeContents);
		});
	}
}

function loadFileMetadata(filePath, rootPath, includeContents) {
	return new Promise(function(resolve, reject) {
		fs.stat(filePath, function(error, stat) {
			if (error) { return reject(error); }
			var relativePath = getRelativePath(filePath, rootPath);
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
}

function parseStatModel(stat, filePath) {
	var mimeType = stat.isFile() ? mime.lookup(filePath) : null;
	var hasThumbnail = Boolean(mimeType) && mimeType.split('/')[0] === 'image';
	var isDirectory = stat.isDirectory();
	return new FileModel({
		id: filePath,
		path: filePath,
		mimeType: mimeType,
		size: stat.size,
		modified: stat.mtime.toISOString(),
		thumbnail: hasThumbnail,
		directory: isDirectory
	});
}

function getRelativePath(filePath, rootPath) {
	if (!rootPath) { return filePath; }
	return '/' + path.relative(rootPath, filePath);
}
