'use strict';

var path = require('path');
var aws = require('aws-sdk');
var mime = require('mime');

function S3UploadAdapter(options) {
	options = options || {};
	var bucket = options.bucket || null;
	var accessKey = options.accessKey || null;
	var secretKey = options.secretKey || null;
	var pathPrefix = options.root || null;

	if (!bucket) { throw new Error('Missing bucket name'); }
	if (secretKey && !accessKey) { throw new Error('Missing access key'); }
	if (accessKey && !secretKey) { throw new Error('Missing secret key'); }

	this.bucket = bucket;
	this.accessKey = accessKey;
	this.secretKey = secretKey;
	this.pathPrefix = pathPrefix;
}

S3UploadAdapter.prototype.bucket = null;
S3UploadAdapter.prototype.accessKey = null;
S3UploadAdapter.prototype.secretKey = null;
S3UploadAdapter.prototype.pathPrefix = null;

S3UploadAdapter.prototype.generateRequest = function(filePath) {
	var bucketName = this.bucket;
	var accessKey = this.accessKey;
	var secretKey = this.secretKey;
	var pathPrefix = this.pathPrefix;

	var self = this;
	return new Promise(function(resolve, reject) {
		if (accessKey && secretKey) {
			aws.config.update({
				accessKeyId: accessKey,
				secretAccessKey: secretKey
			});
		}
		var mimeType = mime.lookup(filePath);
		var fullPath = (pathPrefix ? path.join(pathPrefix, filePath) : filePath);
		var s3 = new aws.S3();
		var params = {
			Bucket: bucketName,
			Key: fullPath,
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
				location: self.getDownloadUrl(filePath)
			});
		});
	});
};

S3UploadAdapter.prototype.getDownloadUrl = function(filePath) {
	var bucketName = this.bucket;
	var pathPrefix = this.pathPrefix;
	var fullPath = (pathPrefix ? path.join(pathPrefix, filePath) : filePath);
	return 'https://' + bucketName + '.s3.amazonaws.com/' + fullPath;
};

module.exports = S3UploadAdapter;
