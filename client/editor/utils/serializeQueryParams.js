'use strict';

module.exports = function(params) {
	return Object.keys(params).map(function(key) {
		var value = params[key];
		return key + '=' + encodeURIComponent(JSON.stringify(value));
	}).join('&');
};
