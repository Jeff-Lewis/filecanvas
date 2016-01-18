'use strict';

var path = require('path');

module.exports['basename'] = function(value, options) {
	return path.basename(value);
};
module.exports['dirname'] = function(value, options) {
	return path.dirname(value);
};
module.exports['extname'] = function(value, options) {
	return path.extname(value);
};
