'use strict';

var MAX_HEADER_LENGTH = 2048;

module.exports = function() {
	var isProduction = process.env.NODE_ENV === 'production';

	return function(err, req, res, next) {
		var url = req.protocol + '://' + req.get('host') + req.originalUrl;
		var status = err.status || 500;
		var shouldHideErrorMessage = (status === 500) && isProduction;
		var errorHeaders = {};
		if (!shouldHideErrorMessage) {
			errorHeaders['X-Error-Message'] = err.message;
		}
		if (!isProduction) {
			errorHeaders['X-Error-Method'] = req.method;
			errorHeaders['X-Error-Url'] = url;
			errorHeaders['X-Error-Debug'] = err.stack;
		}
		res.status(status);
		for (var key in errorHeaders) {
			var value = errorHeaders[key];
			res.set(key, formatErrorHeader(value));
		}
		res.send(status);
	};

	function formatErrorHeader(value) {
		if (!value) { return null; }
		var maxLength = MAX_HEADER_LENGTH;
		value = (value.length <= maxLength ? value : truncate(value, maxLength, { ellipsis: '...' }));
		return JSON.stringify(value);
	}

	function truncate(string, length, options) {
		options = options || {};
		var ellipsis = options.ellipsis || '';
		return string.substr(0, length - ellipsis.length) + ellipsis;
	}
};
