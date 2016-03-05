'use strict';

var xhr = require('./xhr');

module.exports = function(file, options) {
	options = options || {};
	var requestUploadUrl = options.requestUploadUrl;
	var requestUploadMethod = options.requestUploadMethod;

	if (!requestUploadUrl) { return new $.Deferred().reject(new Error('No upload URL specified')).promise(); }

	var deferred = new $.Deferred();
	var activeRequest = null;

	var retrieveUploadUrlProgressRatio = 0.25;
	var uploadProgressRatio = (1 - retrieveUploadUrlProgressRatio);
	abortable(retrieveUploadUrl(file, {
		url: requestUploadUrl,
		method: requestUploadMethod
	}))
		.progress(function(progress) {
			var percentageLoaded = 100 * (progress.bytesLoaded / progress.bytesTotal);
			deferred.notify({
				loaded: percentageLoaded * retrieveUploadUrlProgressRatio,
				total: 100
			});
		})
		.then(function(response) {
			var uploadOptions = response.upload;
			var uploadedUrl = response.location;
			var uploadId = response.id;
			return abortable(upload(file, uploadOptions))
				.progress(function(progress) {
					var percentageAlreadyLoaded = 100 * retrieveUploadUrlProgressRatio;
					var percentageUploaded = 100 * uploadProgressRatio * (progress.bytesLoaded / progress.bytesTotal);
					deferred.notify({
						loaded: percentageAlreadyLoaded + percentageUploaded,
						total: 100
					});
				})
				.then(function(response) {
					return {
						id: uploadId,
						location: uploadedUrl
					};
				});
		})
		.then(function(value) {
			deferred.resolve(value);
		})
		.fail(function(error) {
			deferred.reject(error);
		});
	var uploadPromise = deferred.promise();
	uploadPromise.abort = function() {
		if (activeRequest) {
			activeRequest.abort();
		}
	};
	return deferred.promise();


	function retrieveUploadUrl(file, options) {
		options = options || {};
		var url = options.url + '/' + file.name;
		var method = options.method;
		return xhr.send({ url: url, method: method });
	}

	function upload(file, options) {
		var method = options.method;
		var url = options.url;
		var headers = options.headers;
		return xhr.upload({
			method: method,
			url: url,
			headers: headers,
			body: file
		});
	}

	function abortable(promise) {
		var abortablePromise = promise
			.then(function(value) {
				activeRequest = null;
				return value;
			})
			.fail(function(error) {
				activeRequest = null;
			});
		abortablePromise.abort = function() {
			activeRequest = null;
			promise.abort();
		};
		activeRequest = abortablePromise;
		return abortablePromise;
	}
};
