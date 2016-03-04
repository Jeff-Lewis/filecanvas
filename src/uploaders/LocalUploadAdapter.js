'use strict';

var path = require('path');

function LocalUploadAdapter(options) {
	options = options || {};
	var uploadUrl = options.uploadUrl || null;
	var downloadUrl = options.downloadUrl || null;

	if (!uploadUrl) { throw new Error('Missing upload URL'); }
	if (!downloadUrl) { throw new Error('Missing download URL'); }

	this.uploadUrl = uploadUrl;
	this.downloadUrl = downloadUrl;
}

LocalUploadAdapter.prototype.generateRequest = function(filePath) {
	var uploadUrl = this.uploadUrl + filePath;

	var self = this;
	return Promise.resolve({
		upload: {
			url: uploadUrl,
			method: 'POST',
			headers: null
		},
		location: self.getDownloadUrl(filePath)
	});
};

LocalUploadAdapter.prototype.getDownloadUrl = function(filePath) {
	var downloadUrl = this.downloadUrl;
	return path.join(downloadUrl, filePath);
};

module.exports = LocalUploadAdapter;
