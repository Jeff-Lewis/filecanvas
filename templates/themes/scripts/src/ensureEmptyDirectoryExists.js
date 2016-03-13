'use strict';

var fs = require('fs');
var mkdirp = require('mkdirp');

module.exports = function(path) {
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
};

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

function readDirectoryContents(path) {
	return new Promise(function(resolve, reject) {
		fs.readdir(path, function(error, files) {
			if (error) { return reject(error); }
			return resolve(files);
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
