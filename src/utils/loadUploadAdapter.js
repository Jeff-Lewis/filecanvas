'use strict';

var LocalUploadAdapter = require('../uploaders/LocalUploadAdapter');
var S3UploadAdapter = require('../uploaders/S3UploadAdapter');

module.exports = function(adapterConfig) {
	if (!adapterConfig) { throw new Error('Missing adapter config'); }

	var adapterName = adapterConfig.adapter;
	switch(adapterName) {
		case 'local':
			return createLocalAdapter(adapterConfig);
		case 's3':
			return createS3Adapter(adapterConfig);
		default:
			throw new Error('Invalid adapter: ' + adapterName);
	}


	function createLocalAdapter(adapterConfig) {
		return new LocalUploadAdapter({
			uploadUrl: adapterConfig.uploadUrl,
			downloadUrl: adapterConfig.downloadUrl
		});
	}

	function createS3Adapter(adapterConfig) {
		return new S3UploadAdapter({
			bucket: adapterConfig.bucket,
			accessKey: adapterConfig.accessKey,
			secretKey: adapterConfig.secretKey
		});
	}
};
