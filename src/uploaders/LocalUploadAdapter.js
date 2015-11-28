'use strict';

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
	var downloadUrl = this.downloadUrl + filePath;

	return Promise.resolve({
		upload: {
			url: uploadUrl,
			method: 'POST',
			headers: null
		},
		location: downloadUrl
	});
};

module.exports = LocalUploadAdapter;
