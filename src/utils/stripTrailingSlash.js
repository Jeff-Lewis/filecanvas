'use strict';
module.exports = function(string) {
	var REGEXP_TRAILING_SLASH = /\/+$/;
	return string.replace(REGEXP_TRAILING_SLASH, '');
};
