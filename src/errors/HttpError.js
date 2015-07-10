'use strict';

var http = require('http');

function HttpError(status, description, url) {
	status = status || 500;
	description = description || null;
	var message = http.STATUS_CODES[status];
	var error = new Error(message);
	error.name = 'HttpError';
	error.status = status;
	error.description = description;
	error.url = null;
	error.toString = function() {
		return this.name + ': ' + this.status + ' ' + this.message + (this.description ? ' - ' + this.description : '') + (this.url ? ' - ' + this.url : '');
	};
	return error;
}

module.exports = HttpError;
