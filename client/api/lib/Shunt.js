'use strict';

var DROPBOX_UPLOAD_API_METHOD = 'PUT';
var DROPBOX_UPLOAD_API_ENDPOINT = 'https://content.dropboxapi.com/1/files_put/auto';

var LOCAL_UPLOAD_API_METHOD = 'POST';
var LOCAL_UPLOAD_API_ENDPOINT = document.location.protocol + '//upload.' + document.location.host.split('.').slice(1).join('.');

function UploadBatch(files) {
	this.items = files.map(function(file) {
		return createBatchItem(file);
	});
}

UploadBatch.prototype.append = function(files) {
	var items = files.map(function(file) {
		return createBatchItem(file);
	});
	this.items = this.items.concat(items);
};

UploadBatch.prototype.cancel = function() {
	this.items.forEach(function(item) {
		if (item.completed || item.error || item.started) { return; }
		item.error = new Error('Transfer canceled');
	});
};

Object.defineProperty(UploadBatch.prototype, 'length', {
	get: function() {
		return this.items.length;
	}
});

Object.defineProperty(UploadBatch.prototype, 'numLoaded', {
	get: function() {
		return this.items.reduce(function(count, item) {
			return (item.completed ? count + 1 : count);
		}, 0);
	}
});

Object.defineProperty(UploadBatch.prototype, 'numFailed', {
	get: function() {
		return this.items.reduce(function(count, item) {
			return (item.error ? count + 1 : count);
		}, 0);
	}
});

Object.defineProperty(UploadBatch.prototype, 'bytesLoaded', {
	get: function() {
		return this.items.reduce(function(count, item) {
			return count + (item.error ? 0 : item.bytesLoaded);
		}, 0);
	}
});

Object.defineProperty(UploadBatch.prototype, 'bytesTotal', {
	get: function() {
		return this.items.reduce(function(count, item) {
			return count + (item.error ? 0 : item.bytesTotal);
		}, 0);
	}
});

Object.defineProperty(UploadBatch.prototype, 'currentItem', {
	get: function() {
		return this.items.filter(function(item) {
			return item.started && !item.completed;
		})[0] || null;
	}
});

Object.defineProperty(UploadBatch.prototype, 'pendingItems', {
	get: function() {
		return this.items.filter(function(item) {
			return !item.started && !item.error;
		});
	}
});

Object.defineProperty(UploadBatch.prototype, 'completedItems', {
	get: function() {
		return this.items.filter(function(item) {
			return item.completed;
		});
	}
});

Object.defineProperty(UploadBatch.prototype, 'failedItems', {
	get: function() {
		return this.items.filter(function(item) {
			return item.error;
		});
	}
});

UploadBatch.prototype.getItemAt = function(index) {
	return this.items[index];
};

function createBatchItem(file) {
	return {
		file: file,
		filename: file.data.name,
		bytesLoaded: 0,
		bytesTotal: file.data.size,
		started: false,
		completed: false,
		error: false
	};
}

function Shunt() {
}

Shunt.prototype.purgeSiteCache = function(siteAlias) {
	var url = '/sites/' + siteAlias;
	var settings = {
		type: 'POST',
		beforeSend: function(xhr){
			xhr.setRequestHeader('X-HTTP-Method-Override', 'PUT');
		},
		data: {
			'_action': 'purge'
		}
	};
	return $.ajax(url, settings)
		.then(function(data, textStatus, jqXHR) {
			return new $.Deferred().resolve().promise();
		})
		.fail(function(jqXHR, textStatus, errorThrown) {
			return new $.Deferred().reject(new Error(errorThrown)).promise();
		});
};

Shunt.prototype.validateFolder = function(adapter, path) {
	if (!path || (path.charAt(0) !== '/')) {
		return new $.Deferred().resolve(false).promise();
	}
	var url = '/metadata/' + adapter + path;
	var settings = {
		type: 'GET',
		dataType: 'json'
	};
	return $.ajax(url, settings)
		.then(function(data, textStatus, jqXHR) {
			var isValidFolder = Boolean(data && data.directory);
			return isValidFolder;
		})
		.fail(function(jqXHR, textStatus, errorThrown) {
			return new $.Deferred().reject(new Error(errorThrown)).promise();
		});
};

Shunt.prototype.uploadFiles = function(files, adapterConfig) {
	if (files.length === 0) {
		return new $.Deferred().resolve().promise();
	}
	var deferred = new $.Deferred();
	var queue = new UploadBatch(files);
	var currentIndex = -1;
	var activeTransfer = loadNextFile();
	var promise = deferred.promise();
	promise.abort = function() {
		queue.cancel();
		if (activeTransfer) { activeTransfer.abort(); }
	};
	promise.append = function(files) {
		queue.append(files);
	};
	return promise;


	function loadNextFile() {
		if (currentIndex === queue.length - 1) {
			deferred.resolve(queue);
			return null;
		}
		var queueItem = queue.getItemAt(++currentIndex);
		var transfer = loadQueueItem(queueItem);
		transfer
			.progress(onFileProgress)
			.then(onFileLoaded)
			.fail(onFileError);
		return transfer;
	}

	function onFileProgress(queueItem) {
		deferred.notify(queue);
	}

	function onFileLoaded(queueItem) {
		deferred.notify(queue);
		activeTransfer = loadNextFile();
	}

	function onFileError(error) {
		deferred.notify(queue);
		activeTransfer = loadNextFile();
	}

	function loadQueueItem(queueItem) {
		if (queueItem.error) {
			return new $.Deferred().reject(queueItem.error).promise();
		}

		var deferred = new $.Deferred();
		var file = queueItem.file;

		queueItem.started = true;
		deferred.notify(queueItem);

		var fileUpload = uploadFile(file);
		fileUpload
			.progress(onFileProgress)
			.then(onFileLoaded)
			.fail(onFileError);

		var promise = deferred.promise();
		promise.abort = function() {
			fileUpload.abort();
		};
		return promise;


		function onFileProgress(progress) {
			queueItem.bytesLoaded = progress.bytesLoaded;
			deferred.notify(queueItem);
		}

		function onFileLoaded(response) {
			var renamedPath = response.path;
			var renamedFilename = renamedPath.split('/').pop();
			queueItem.bytesLoaded = queueItem.bytesTotal;
			queueItem.completed = true;
			queueItem.filename = renamedFilename;
			deferred.resolve(queueItem);
		}

		function onFileError(error) {
			queueItem.error = error;
			deferred.reject(error);
		}
	}

	function uploadFile(file) {
		switch (adapterConfig.adapter) {
			case 'dropbox':
				return uploadDropboxFile(file, adapterConfig);
			case 'local':
				return uploadLocalFile(file, adapterConfig);
			default:
				return new $.Deferred().reject(new Error('Invalid adapter: ' + adapterConfig.adapter)).promise();
		}


		function uploadDropboxFile(file, options) {
			var pathPrefix = options.path;
			var accessToken = options.token;
			var uploadPath = pathPrefix + file.path;
			var method = DROPBOX_UPLOAD_API_METHOD;
			var url = getUploadUrl(DROPBOX_UPLOAD_API_ENDPOINT, uploadPath, {
				overwrite: false,
				autorename: true
			});
			var headers = {
				'Authorization': 'Bearer ' + accessToken
			};
			return uploadXhrData(file.data, method, url, headers);
		}

		function uploadLocalFile(file, options) {
			var pathPrefix = options.path;
			var uploadPath = pathPrefix + file.path;
			var method = LOCAL_UPLOAD_API_METHOD;
			var url = getUploadUrl(LOCAL_UPLOAD_API_ENDPOINT, uploadPath, {
				overwrite: false,
				autorename: true
			});
			var headers = null;
			return uploadXhrData(file.data, method, url, headers);
		}

		function uploadXhrData(data, method, url, headers) {
			headers = headers || {};
			var deferred = new $.Deferred();
			var xhr = new XMLHttpRequest();
			var async = true;
			xhr.open(method, url, async);
			for (var key in headers) {
				xhr.setRequestHeader(key, headers[key]);
			}
			xhr.upload.addEventListener('progress', onUploadProgress);
			xhr.upload.addEventListener('load', onUploadProgress);
			xhr.addEventListener('load', onTransferCompleted);
			xhr.addEventListener('error', onTransferFailed);
			xhr.addEventListener('abort', onTransferAborted);
			xhr.send(data);
			var promise = deferred.promise();
			promise.abort = function() {
				xhr.abort();
			};
			return promise;


			function onUploadProgress(event) {
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
				var response = JSON.parse(xhr.responseText);
				deferred.resolve(response);
			}
		}

		function getUploadUrl(endpoint, filePath, params) {
			var queryString = formatQueryString(params);
			var url = endpoint + filePath + (queryString ? '?' + queryString : '');
			return url;


			function formatQueryString(params) {
				return Object.keys(params).map(function(key) {
					return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
				}).join('&');
			}
		}
	}
};

module.exports = Shunt;
