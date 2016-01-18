'use strict';

module.exports['json'] = function(value, indent, options) {
	return JSON.stringify(value, null, indent);
};
module.exports['parse-json'] = function(value, indent, options) {
	return JSON.parse(value);
};
module.exports['urlencode'] = function(value, options) {
	return encodeURIComponent(value);
};
module.exports['urldecode'] = function(value, options) {
	return encodeURIComponent(value);
};
