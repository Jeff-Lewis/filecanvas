'use strict';

var fs = require('fs');
var path = require('path');
var memoize = require('lodash.memoize');
var junk = require('junk');

module.exports = memoize(function(partialsRoot) {
	try {
		var filenames = fs.readdirSync(partialsRoot);
		return filenames.filter(function(filename) {
			return junk.not(filename);
		}).map(function(filename) {
			return {
				id: stripExtension(filename),
				path: path.resolve(partialsRoot, filename)
			};
		}).filter(function(partial) {
			return !fs.statSync(partial.path).isDirectory();
		})
		.reduce(function(partials, partial) {
			partials[partial.id] = partial.path;
			return partials;
		}, {});
	} catch (error) {
		return {};
	}
});

function stripExtension(filename) {
	return path.basename(filename, path.extname(filename));
}
