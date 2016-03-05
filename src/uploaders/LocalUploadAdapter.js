'use strict';

var util = require('util');
var url = require('url');
var https = require('https');
var request = require('request');
var urlJoin = require('url-join');

var UploadAdapter = require('./UploadAdapter');

var HttpError = require('../errors/HttpError');

function LocalUploadAdapter(options) {
	options = options || {};
	var uploadUrl = options.uploadUrl || null;
	var downloadUrl = options.downloadUrl || null;

	if (!uploadUrl) { throw new Error('Missing upload URL'); }
	if (!downloadUrl) { throw new Error('Missing download URL'); }

	UploadAdapter.call(this);

	this.uploadUrl = uploadUrl;
	this.downloadUrl = downloadUrl;
}

util.inherits(LocalUploadAdapter, UploadAdapter);

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
	return urlJoin(downloadUrl, filePath);
};

LocalUploadAdapter.prototype.readFile = function(filePath) {
	var downloadUrl = this.getDownloadUrl(filePath);
	return loadPotentiallyInsecureUrlContents(downloadUrl);

	function loadPotentiallyInsecureUrlContents(targetUrl) {
		var protocol = url.parse(targetUrl).protocol;
		var agent = (protocol === 'https:' ? new https.Agent({ rejectUnauthorized: false }) : null);
		return new Promise(function(resolve, reject) {
			request({ url: targetUrl, agent: agent }, function(error, response, body) {
				if (error) { return reject(error); }
				if (response.statusCode >= 400) {
					return reject(new HttpError(response.statusCode, body));
				}
				resolve(body);
			});
		});
	}
};

module.exports = LocalUploadAdapter;
