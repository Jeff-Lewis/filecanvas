'use strict';

var assert = require('assert');
var util = require('util');
var path = require('path');
var mime = require('mime');
var aws = require('aws-sdk');

var UploadAdapter = require('./UploadAdapter');

function S3UploadAdapter(options) {
	options = options || {};
	var bucket = options.bucket || null;
	var accessKey = options.accessKey || null;
	var secretKey = options.secretKey || null;
	var pathPrefix = options.root || null;

	assert(bucket, 'Missing bucket name');
	if (accessKey || secretKey) {
		assert(accessKey, 'Missing access key');
		assert(secretKey, 'Missing secret key');
	}

	UploadAdapter.call(this);

	this.bucket = bucket;
	this.accessKey = accessKey;
	this.secretKey = secretKey;
	this.pathPrefix = pathPrefix;
}

util.inherits(S3UploadAdapter, UploadAdapter);

S3UploadAdapter.prototype.bucket = null;
S3UploadAdapter.prototype.accessKey = null;
S3UploadAdapter.prototype.secretKey = null;
S3UploadAdapter.prototype.pathPrefix = null;

S3UploadAdapter.prototype.generateRequest = function(filePath) {
	try {
		assert(filePath, 'Missing file path');
	} catch (error) {
		return Promise.reject(error);
	}

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
						'x-amz-acl': 'public-read',
						'Content-Type': mimeType
					}
				},
				location: self.getDownloadUrl(filePath)
			});
		});
	});
};

S3UploadAdapter.prototype.getDownloadUrl = function(filePath) {
	try {
		assert(filePath, 'Missing file path');
	} catch (error) {
		return Promise.reject(error);
	}

	var bucketName = this.bucket;
	var pathPrefix = this.pathPrefix;
	var fullPath = (pathPrefix ? path.join(pathPrefix, filePath) : filePath);
	return 'https://' + bucketName + '.s3.amazonaws.com/' + fullPath;
};

S3UploadAdapter.prototype.readFile = function(filePath) {
	try {
		assert(filePath, 'Missing file path');
	} catch (error) {
		return Promise.reject(error);
	}

	var bucketName = this.bucket;
	var pathPrefix = this.pathPrefix;
	var fullPath = (pathPrefix ? path.join(pathPrefix, filePath) : filePath);

	return new Promise(function(resolve, reject) {
		var s3 = new aws.S3();
		var params = {
			'Bucket': bucketName,
			'Key': fullPath,
			'ResponseContentType': mime.lookup(fullPath)
		};
		s3.getObject(params, function(error, data) {
			if (error) { return reject(error); }
			var fileContents = data['Body'];
			resolve(fileContents);
		});
	});
};

module.exports = S3UploadAdapter;
