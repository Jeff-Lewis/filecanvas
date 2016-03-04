'use strict';

function UploadAdapter() {
}

UploadAdapter.prototype.generateRequest = function(filePath) {
	return Promise.reject(new Error('Not implemented'));
};

UploadAdapter.prototype.getDownloadUrl = function(filePath) {
	throw new Error('Not implemented');
};

module.exports = UploadAdapter;
