'use strict';

var http = require('http');

module.exports = function(options) {
	var debugMode = Boolean(options.debug);

	return function(err, req, res, next) {
		var templateOptions = getErrorTemplateOptions(err, debugMode);
		res.render('error/error', templateOptions);


		function getErrorTemplateOptions(error) {
			var status = error.status || 500;
			var description = http.STATUS_CODES[status];
			return {
				error: error,
				status: status,
				description: description,
				message: error.message,
				stack: error.stack
			};
		}
	};
};
