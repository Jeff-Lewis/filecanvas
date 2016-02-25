'use strict';

var http = require('http');

function HttpError(status, message) {
	status = status || 500;
	message = message || null;
	var error = new Error(message || '');
	error.name = 'HttpError';
	error.status = status;
	error.toString = function() {
		return this.name + ': ' + this.status + ' ' + http.STATUS_CODES[this.status] + (this.message ? ' - ' + this.message : '');
	};
	return error;
}

module.exports = HttpError;
