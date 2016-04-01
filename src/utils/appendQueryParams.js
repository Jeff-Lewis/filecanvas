'use strict';

var serializeQueryParams = require('./serializeQueryParams');

module.exports = function(url, params) {
	if (!params) { return url; }
	var queryString = serializeQueryParams(params);
	var urlHasParams = (url.indexOf('?') !== -1);
	return url + (queryString ? (urlHasParams ? '&' : '?') + queryString : '');
};
