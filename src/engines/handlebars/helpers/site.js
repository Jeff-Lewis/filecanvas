'use strict';

var path = require('path');
var bytes = require('bytes');

module.exports['loginUrl'] = function(rootModel) {
	return rootModel.metadata.siteRoot + 'login';
};
module.exports['logoutUrl'] = function(rootModel) {
	return rootModel.metadata.siteRoot + 'logout';
};
module.exports['resourceUrl'] = function(rootModel, filePath) {
	return rootModel.metadata.themeRoot + filePath;
};
module.exports['downloadUrl'] = function(rootModel, file) {
	return rootModel.metadata.siteRoot + 'download' + file.path;
};
module.exports['thumbnailUrl'] = function(rootModel, file) {
	return rootModel.metadata.siteRoot + 'thumbnail' + file.path;
};
module.exports['extension'] = function(file, options) {
	return path.extname(file.path).replace(/^\./, '');
};
module.exports['filesize'] = function(file, options) {
	return bytes.format(file.size, { precision: 1 });
};
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
	var file1Date = new Date(file1.modified);
	var file2Date = new Date(file2.modified);
	return file2Date.getTime() - file1Date.getTime();
}

function stripLeadingNumber(string) {
	return string.replace(/^[0-9]+[ \.\-\|]*/, '');
}
