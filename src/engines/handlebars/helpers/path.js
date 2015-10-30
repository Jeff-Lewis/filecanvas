'use strict';

var path = require('path');
var bytes = require('bytes');

module.exports['basename'] = function(value, options) {
	return path.basename(value.path);
};
module.exports['dirname'] = function(value, options) {
	return path.dirname(value.path);
};
module.exports['extension'] = function(value, options) {
	return path.extname(value.path).replace(/^\./, '');
};
module.exports['filesize'] = function(value, options) {
	return bytes.format(value.size, { precision: 1 });
};
