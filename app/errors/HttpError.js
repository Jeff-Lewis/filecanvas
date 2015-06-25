'use strict';

var http = require('http');

function HttpError(status, description) {
	status = status || 500;
	description = description || null;
	var message = http.STATUS_CODES[status];
	var error = new Error(message);
	error.status = status;
	error.description = description;
	return error;
}

module.exports = HttpError;
