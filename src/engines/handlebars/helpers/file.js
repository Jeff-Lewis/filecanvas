'use strict';

var path = require('path');

module.exports['files'] = function(value, options) {
	if (!value.contents) { return null; }
	return value.contents.filter(function(file) {
		return !file.directory;
	}).sort(function(file1, file2) {
		return sortByPrefixedFilename(file1, file2) || sortByLastModified(file1, file2);
	});
};
module.exports['folders'] = function(value, options) {
	if (!value.contents) { return null; }
	return value.contents.filter(function(file) {
		return file.directory;
	}).sort(function(file1, file2) {
		return sortByPrefixedFilename(file1, file2) || sortByFilename(file1, file2);
	});
};
module.exports['strip-number-prefix'] = function(value, options) {
	var label = path.basename(value.path, path.extname(value.path));
	return stripLeadingNumber(label);
};

function sortByPrefixedFilename(file1, file2) {
	var file1Filename = path.basename(file1.path);
	var file2Filename = path.basename(file2.path);
	var file1Prefix = parseInt(file1Filename);
	var file2Prefix = parseInt(file2Filename);
	var file1HasPrefix = !isNaN(file1Prefix);
	var file2HasPrefix = !isNaN(file2Prefix);
	if (!file1HasPrefix && !file2HasPrefix) { return 0; }
	if (file1HasPrefix && !file2HasPrefix) { return -1; }
	if (file2HasPrefix && !file1HasPrefix) { return 1; }
	if (file1Prefix === file2Prefix) {
		return sortByFilename(file1, file2);
	}
	return file1Prefix - file2Prefix;
}

function sortByFilename(file1, file2) {
	var file1Filename = path.basename(file1.path);
	var file2Filename = path.basename(file2.path);
	return (file1Filename.toLowerCase() < file2Filename.toLowerCase() ? -1 : 1);
}

function sortByLastModified(file1, file2) {
	var file1Date = file1.modified;
	var file2Date = file2.modified;
	return file2Date.getTime() - file1Date.getTime();
}

function stripLeadingNumber(string) {
	return string.replace(/^[0-9]+[ \.\-\|]*/, '');
}
