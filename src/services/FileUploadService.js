'use strict';

var path = require('path');
var uuid = require('uuid');

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

module.exports = FileUploadService;
