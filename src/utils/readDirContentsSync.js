'use strict';

var fs = require('fs');
var path = require('path');
var junk = require('junk');

module.exports = function(dirPath) {
	return readDirFiles(dirPath);


	function readDirFiles(dirPath) {
		var filenames = fs.readdirSync(dirPath);
		var dirContents = filenames.reduce(function(dirContents, filename) {
			if (junk.is(filename)) { return dirContents; }
			var filePath = path.join(dirPath, filename);
			var isDirectory = fs.statSync(filePath).isDirectory();
			var fileValue = (isDirectory ? readDirFiles(filePath) : fs.readFileSync(filePath));
			dirContents[filename] = fileValue;
			return dirContents;
		}, {});
		return dirContents;
	}
};
