'use strict';

var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');
var express = require('express');
var cors = require('cors');

var parseStatModel = require('../utils/parseStatModel');

var HttpError = require('../errors/HttpError');

module.exports = function(destDir, options) {
	options = options || {};
	var host = options.host || null;

	var app = express();

	if (host) {
		app.use(cors({
			origin: new RegExp('^https?://(?:\\w+\\.)*' + host + '(?::\\d+)?$')
		}));
	}

	app.post('*', function(req, res, next) {
		var overwrite = Boolean(req.query.overwrite);
		var autorename = Boolean(req.query.autorename);
		var filePath = req.params[0];
		var destPath = path.join(destDir, filePath);
		getWritableFilePath(destPath, {
			overwrite: overwrite,
			autorename: autorename
		})
		.then(function(destPath) {
			return writeFile(req, destPath)
				.then(function() {
					return loadFileMetaData(destPath);
				});
		})
		.then(function(fileModel) {
			res.json(fileModel);
		})
		.catch(function(error) {
			next(error);
		});
	});

	return app;


	function getWritableFilePath(destPath, options) {
		options = options || {};
		var overwrite = Boolean(options.overwrite);
		var autorename = Boolean(options.autorename);
		return checkWhetherFileExists(destPath)
			.then(function(fileExists) {
				if (!fileExists) { return destPath; }
				if (autorename) {
					var filename = path.basename(destPath);
					var renamedFilename = getRenamedFilename(filename);
					var renamedPath = path.join(path.dirname(destPath), renamedFilename);
					return getWritableFilePath(renamedPath, options);
				} else if (overwrite) {
					return deleteFile(destPath)
						.then(function() {
							return destPath;
						});
				}
				throw new HttpError(409, 'A file already exists at this location');
			});
	}

	function checkWhetherFileExists(filePath) {
		return new Promise(function(resolve, reject) {
			fs.stat(filePath, function(error, stat) {
				if (error && (error.code === 'ENOENT')) {
					return resolve(false);
				}
				if (error) { return reject(error); }
				var fileExists = Boolean(stat);
				resolve(fileExists);
			});
		});
	}

	function getRenamedFilename(filename) {
		var extension = path.extname(filename);
		filename = path.basename(filename, extension);
		var AUTONUMBER_REGEXP = / \((\d+)\)$/;
		var endsWithNumber = AUTONUMBER_REGEXP.test(filename);
		if (endsWithNumber) {
			filename = filename.replace(AUTONUMBER_REGEXP, function(match, number) {
				var autonumber = parseInt(number) + 1;
				return ' (' + autonumber + ')';
			});
		} else {
			filename = filename + ' (1)';
		}
		return filename + extension;
	}

	function deleteFile(filePath) {
		return new Promise(function(resolve, reject) {
			fs.unlink(filePath, function(error) {
				if (error) { return reject(error); }
				resolve();
			});
		});
	}

	function writeFile(sourceStream, destPath) {
		return new Promise(function(resolve, reject) {
			var dirPath = path.dirname(destPath);
			mkdirp(dirPath, function(error) {
				if (error) { return reject(error); }
				var destStream = fs.createWriteStream(destPath);
				destStream.on('finish', resolve);
				destStream.on('error', reject);
				sourceStream.pipe(destStream);
			});
		});
	}

	function loadFileMetaData(filePath) {
		return new Promise(function(resolve, reject) {
			fs.stat(filePath, function(error, stat) {
				if (error) { return reject(error); }
				var fileModel = parseStatModel(stat, filePath);
				resolve(fileModel);
			});
		});
	}
};
