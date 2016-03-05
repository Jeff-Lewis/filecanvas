'use strict';

var path = require('path');
var uuid = require('uuid');
var objectAssign = require('object-assign');

var HttpError = require('../errors/HttpError');

function FileUploadService(options) {
	options = options || {};
	var adapter = options.adapter;

	if (!adapter) { throw new Error('Missing upload adapter'); }

	this.adapter = adapter;
}

FileUploadService.prototype.generateUniqueFilename = function(filename) {
	var uniqueId = uuid.v4();
	var renamedFilename = uniqueId + '/' + path.basename(filename);
	return renamedFilename;
};

FileUploadService.prototype.generateRequest = function(filename) {
	if (!filename) { return Promise.reject(new Error('Missing filename')); }
	var adapter = this.adapter;
	return adapter.generateRequest(filename);
};

FileUploadService.prototype.middleware = function() {
	var self = this;

	return function(req, res, next) {
		var filename = req.params.filename;
		if (!filename) { return next(new HttpError(400, 'No filename specified')); }
		var renamedFilename = self.generateUniqueFilename(filename);
		var uploadPath = path.join(path.dirname(filename), renamedFilename);
		self.generateRequest(uploadPath)
			.then(function(response) {
				res.json(objectAssign({}, response, { id: renamedFilename }));
			})
			.catch(function(error) {
				next(error);
			});
	};
};

module.exports = FileUploadService;
