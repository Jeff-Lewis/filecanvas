'use strict';

var path = require('path');
var isPathInside = require('is-path-inside');

var HttpError = require('../errors/HttpError');

module.exports = function(from, to) {
	var parentPath = path.resolve(from);
	var childPaths = Array.prototype.slice.call(arguments, 1);
	var fullPath = path.join.apply(path, [parentPath].concat(childPaths));
	if (!isPathInside(fullPath, parentPath)) { throw new HttpError(403, 'Invalid path'); }
	return fullPath;
};
