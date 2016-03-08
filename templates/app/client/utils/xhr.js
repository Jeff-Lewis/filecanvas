'use strict';

var appendQueryParams = require('../../../../src/utils/appendQueryParams');

module.exports.upload = function(options) {
	var isUpload = true;
	return load(options, isUpload);
};

module.exports.send = function(options) {
	var isUpload = false;
	return load(options, isUpload);
};


function load(options, isUpload) {
	options = options || {};
	var method = options.method || (isUpload ? 'POST' : 'GET');
	var url = options.url || null;
	var params = options.params || {};
	var headers = options.headers || {};
	var body = options.body || null;

	var deferred = new $.Deferred();
	var xhr = new XMLHttpRequest();
	var async = true;
	xhr.open(method, appendQueryParams(url, params), async);
	for (var key in headers) {
		xhr.setRequestHeader(key, headers[key]);
	}
	if (isUpload) {
		xhr.upload.addEventListener('progress', onTransferProgress);
		xhr.upload.addEventListener('load', onTransferProgress);
	} else {
		xhr.addEventListener('progress', onTransferProgress);
	}
	xhr.addEventListener('load', onTransferCompleted);
	xhr.addEventListener('error', onTransferFailed);
	xhr.addEventListener('abort', onTransferAborted);
	xhr.send(body);
	var promise = deferred.promise();
	promise.abort = function() {
		xhr.abort();
	};
	return promise;


	function onTransferProgress(event) {
		if (!event.lengthComputable) { return; }
		deferred.notify({
			bytesLoaded: event.loaded,
			bytesTotal: event.total
		});
	}

	function onTransferFailed(event) {
		deferred.reject(new Error('Transfer failed'));
	}

	function onTransferAborted(event) {
		deferred.reject(new Error('Transfer canceled'));
	}

	function onTransferCompleted(event) {
		var xhr = event.currentTarget;
		var hasError = (xhr.status >= 400);
		if (hasError) {
			return onTransferFailed(event);
		}
		var response;
		if (xhr.responseText) {
			try {
				response = JSON.parse(xhr.responseText);
			} catch (error) {
				response = null;
			}
		}
		deferred.resolve(response);
	}
}
