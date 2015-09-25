'use strict';

var quickthumb = require('quickthumb');

module.exports = function(root, options) {
	options = options || {};
	var width = options.width || null;
	var height = options.height || null;
	var cacheRoot = options.cache || null;

	if (!width) { throw new Error('Missing thumbnail width'); }
	if (!height) { throw new Error('Missing thumbnail height'); }
	if (!cacheRoot) { throw new Error('Missing thumbnail cache root'); }

	var middleware = quickthumb.static(root, {
		type: 'resize',
		cacheDir: cacheRoot
	});

	return function(req, res, next) {
		req.query.dim = width + 'x' + height;
		return middleware(req, res, next);
	};
};
