'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var os = require('os');
var del = require('del');
var isPathInside = require('is-path-inside');

module.exports = function(dirName) {
	assert(dirName, 'Missing directory name');
	var tmpdir = os.tmpdir();
	var tempPath = path.join(tmpdir, dirName);
	if (!isPathInside(tempPath, tmpdir)) {
		throw new Error('Invalid temp directory: ' + tempPath);
	}
	del.sync(tempPath, { force: true });
	fs.mkdirSync(tempPath);
	return tempPath;
};
