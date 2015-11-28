'use strict';

var aws = require('aws-sdk');
var mime = require('mime');

function S3UploadAdapter(options) {
	options = options || {};
	var accessKey = options.accessKey || null;
	var secretKey = options.secretKey || null;
	var bucket = options.bucket || null;

	if (!accessKey) { throw new Error('Missing access key'); }
	if (!secretKey) { throw new Error('Missing secret key'); }
	if (!bucket) { throw new Error('Missing bucket name'); }

	this.bucket = bucket;
	this.accessKey = accessKey;
	this.secretKey = secretKey;
}

S3UploadAdapter.prototype.generateRequest = function(filePath) {
	var bucketName = this.bucket;

	return new Promise(function(resolve, reject) {
		var mimeType = mime.lookup(filePath);
		var s3 = new aws.S3();
		var params = {
			Bucket: bucketName,
			Key: filePath,
			Expires: 60,
			ContentType: mimeType,
			ACL: 'public-read'
		};
		s3.getSignedUrl('putObject', params, function(error, url) {
			if (error) { return reject(error); }
			return resolve({
				upload: {
					url: url,
					method: 'PUT',
					headers: {
						'x-amz-acl': 'public-read'
					}
				},
				location: 'https://' + bucketName + '.s3.amazonaws.com/' + filePath
			});
		});
	});
};

module.exports = S3UploadAdapter;
