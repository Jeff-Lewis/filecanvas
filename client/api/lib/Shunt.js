'use strict';

var junk = require('junk');

var DROPBOX_UPLOAD_API_ENDPOINT = 'https://content.dropboxapi.com/1/files_put/auto';
var DROPBOX_UPLOAD_API_METHOD = 'PUT';

function UploadBatch(files) {
	this.items = files.map(function(file) {
		return {
			file: file,
			filename: file.data.name,
			bytesLoaded: 0,
			bytesTotal: file.data.size,
			started: false,
			completed: false,
			error: false
		};
	});
}

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
		});
	}
});

UploadBatch.prototype.getItemAt = function(index) {
	return this.items[index];
};


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
			var isValidFolder = data && data.is_dir && !data.is_deleted;
			return isValidFolder;
		})
		.fail(function(jqXHR, textStatus, errorThrown) {
			return new $.Deferred().reject(new Error(errorThrown)).promise();
		});
};

Shunt.prototype.uploadFiles = function(files, accessToken, options) {
	options = options || {};
	var pathPrefix = options.path || '';
	var overwrite = options.overwrite || false;
	var autorename = options.autorename || false;

	var filteredFiles = files.filter(function(file) {
		var filename = file.data.name;
		return junk.not(filename);
	});

	if (filteredFiles.length === 0) {
		return new $.Deferred().resolve().promise();
	}
	// TODO: Handle Firefox directory upload gracefully
	var deferred = new $.Deferred();
	var queue = new UploadBatch(filteredFiles);
	var currentIndex = -1;
	loadNextFile();
	return deferred.promise();


	function loadNextFile() {
		if (currentIndex === queue.length - 1) {
			deferred.resolve(queue);
			return;
		}
		var queueItem = queue.getItemAt(++currentIndex);
		loadQueueItem(queueItem)
			.progress(onFileProgress)
			.then(onFileLoaded)
			.fail(onFileError);
	}

	function onFileProgress(queueItem) {
		deferred.notify(queue);
	}

	function onFileLoaded(queueItem) {
		deferred.notify(queue);
		loadNextFile();
	}

	function onFileError(error) {
		deferred.notify(queue);
		loadNextFile();
	}

	function loadQueueItem(queueItem) {
		var deferred = new $.Deferred();

		var file = queueItem.file;

		queueItem.started = true;
		deferred.notify(queueItem);

		uploadFile(file)
			.progress(onFileProgress)
			.then(onFileLoaded)
			.fail(onFileError);

		return deferred.promise();


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
		var deferred = new $.Deferred();
		var uploadPath = pathPrefix + file.path;
		var xhr = new XMLHttpRequest();
		var url = getUploadUrl(uploadPath, {
			overwrite: overwrite,
			autorename: autorename
		});
		var async = true;
		xhr.open(DROPBOX_UPLOAD_API_METHOD, url, async);
		xhr.setRequestHeader('Authorization', 'Bearer ' + accessToken);
		xhr.upload.addEventListener('progress', onUploadProgress);
		xhr.upload.addEventListener('load', onUploadProgress);
		xhr.addEventListener('load', onDownloadCompleted);
		xhr.addEventListener('error', onDownloadFailed);
		xhr.send(file.data);
		return deferred.promise();


		function onUploadProgress(event) {
			if (!event.lengthComputable) { return; }
			deferred.notify({
				bytesLoaded: event.loaded,
				bytesTotal: event.total
			});
		}

		function onDownloadCompleted(event) {
			var response = JSON.parse(event.currentTarget.responseText);
			deferred.resolve(response);
		}

		function onDownloadFailed(event) {
			deferred.reject(new Error('File upload failed'));
		}


		function getUploadUrl(filePath, params) {
			var queryString = formatQueryString(params);
			var url = DROPBOX_UPLOAD_API_ENDPOINT + filePath + (queryString ? '?' + queryString : '');
			return url;
		}

		function formatQueryString(params) {
			return Object.keys(params).map(function(key) {
				return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
			}).join('&');
		}
	}
};

module.exports = Shunt;
