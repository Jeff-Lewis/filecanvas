'use strict';

var http = require('http');

var errorTemplates = require('../templates/errorTemplates');

function ErrorTemplateService() {
}

ErrorTemplateService.prototype.renderErrorPage = function(error) {
	var errorTemplate = errorTemplates.error;
	var status = error.status || 500;
	var description = http.STATUS_CODES[status];
	return errorTemplate({
		error: error,
		status: status,
		description: description,
		message: error.message,
		stack: error.stack
	});
};

module.exports = ErrorTemplateService;
