'use strict';

function ResponseService(responders) {
	this.contentTypes = Object.keys(responders).map(function(contentType) {
		return contentType;
	});
	this.responders = responders;
}

ResponseService.prototype.responders = null;

ResponseService.prototype.respondTo = function(req) {
	var contentType = req.accepts(this.contentTypes);
	if (!contentType) {
		var error = new Error();
		error.status = 406;
		throw error;
	}
	var responder = this.responders[contentType];
	return responder();
};

module.exports = ResponseService;
