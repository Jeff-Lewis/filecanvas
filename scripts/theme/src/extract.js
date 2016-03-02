'use strict';

var fs = require('fs');

var ZipFile = require('adm-zip');
var mkdirp = require('mkdirp');

module.exports = function(inputFile, outputDirectory, options, callback) {
	if ((arguments.length === 3) && (typeof options === 'function')) {
		callback = options;
		options = null;
	}
	options = options || {};
	var log = options.log || function(message) { };

	log('Verifying zipped contents of ' + inputFile + '...');
	verifyZipContents(inputFile, function(error) {
		if (error) {
			return callback(error);
		}
		log('Preparing output directory at ' + outputDirectory);
		createDirectory(outputDirectory, function(error) {
			if (error) { return callback(error); }
			log('Extracting zipped contents of ' + outputDirectory);
			extractZipFile(inputFile, outputDirectory, function(error) {
				if (error) { return callback(error); }
				callback(null);
			});
		});
	});


	function verifyZipContents(inputFile, callback) {
		var validationErrors = null;
		try {
			var zipFile = new ZipFile(inputFile);
			var entries = zipFile.getEntries().reduce(function(files, entry) {
				var filename = entry.entryName;
				files[filename] = entry;
				return files;
			}, {});
			validationErrors = getValidationErrors(entries);
		} catch (error) {
			process.nextTick(function() {
				callback(error);
			});
			return;
		}
		process.nextTick(function() {
			if (validationErrors && (validationErrors.length > 0)) {
				var combinedErrorMessage = validationErrors.map(function(error) { return '- ' + error.message; }).join('\n');
				var error = new Error('Validation failed:\n' + combinedErrorMessage);
				return callback(error);
			}
			callback(null);
		});


		function getValidationErrors(entries) {
			var errors = [];
			if (!entries['theme.json']) {
				errors.push(new Error('Missing theme manifest file'));
			}
			if (!entries['templates/']) {
				errors.push(new Error('Missing templates directory'));
			}
			if (!entries['templates/index.hbs']) {
				errors.push(new Error('Missing index template'));
			}
			if (!entries['templates/login.hbs']) {
				errors.push(new Error('Missing login template'));
			}
			if (!entries['preview/']) {
				errors.push(new Error('Missing theme preview directory'));
			}
			if (entries['assets'] && !entries['assets'].isDirectory) {
				errors.push(new Error('Invalid theme assets directory'));
			}
			return (errors.length > 0 ? errors : null);
		}
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

	function extractZipFile(filePath, outputPath, callback) {
		try {
			var zipFile = new ZipFile(filePath);
			var overwrite = false;
			zipFile.extractAllToAsync(outputPath, overwrite, callback);
		} catch (error) {
			process.nextTick(function() {
				callback(error);
			});
			return;
		}
	}
};
