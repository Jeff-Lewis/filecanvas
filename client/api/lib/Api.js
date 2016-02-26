'use strict';

var path = require('path');

var xhr = require('../../utils/xhr');
var GoogleUploader = require('./GoogleUploader');

var FileModel = require('../../../src/models/FileModel');
var TransferBatch = require('./TransferBatch');

var DROPBOX_UPLOAD_API_METHOD = 'PUT';
var DROPBOX_UPLOAD_API_ENDPOINT = 'https://content.dropboxapi.com/1/files_put/auto';

var GOOGLE_CREATE_FOLDER_API_METHOD = 'POST';
var GOOGLE_CREATE_FOLDER_API_ENDPOINT = 'https://www.googleapis.com/drive/v2/files';

var LOCAL_UPLOAD_API_METHOD = 'POST';
var LOCAL_UPLOAD_API_ENDPOINT = document.location.protocol + '//upload.' + document.location.host.split('.').slice(1).join('.');

var MIME_TYPE_GOOGLE_FOLDER = 'application/vnd.google-apps.folder';

function Api() {
}

Api.prototype.purgeSiteCache = function(siteAlias) {
	var url = '/canvases/' + siteAlias;
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

Api.prototype.validateFolder = function(adapter, path) {
	return this.retrieveFileMetadata(adapter, path)
		.then(function(data) {
			var isValidFolder = Boolean(data && data.directory);
			return isValidFolder;
		});
};


Api.prototype.retrieveFileMetadata = function(adapter, path) {
	if (!path || (path.charAt(0) !== '/')) {
		return new $.Deferred().resolve(false).promise();
	}
	var url = '/adapters/' + adapter + '/metadata' + path;
	var settings = {
		type: 'GET',
		dataType: 'json'
	};
	return $.ajax(url, settings)
		.then(function(data, textStatus, jqXHR) {
			return data;
		})
		.fail(function(jqXHR, textStatus, errorThrown) {
			return new $.Deferred().reject(new Error(errorThrown)).promise();
		});
};

Api.prototype.uploadFiles = function(files, options) {
	options = options || {};
	var adapterConfig = options.adapter;
	var numRetries = options.retries || 0;
	if (files.length === 0) {
		return new $.Deferred().resolve().promise();
	}
	var deferred = new $.Deferred();
	var self = this;
	var queue = new TransferBatch(files);
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
		var numRetriesRemaining = numRetries;

		queueItem.started = true;
		deferred.notify(queueItem);

		var fileUpload = startUpload(queueItem);

		var promise = deferred.promise();
		promise.abort = function() {
			fileUpload.abort();
		};
		return promise;


		function startUpload(queueItem) {
			var upload = uploadFile(file);
			upload
				.progress(onFileProgress)
				.then(onFileLoaded)
				.fail(onFileError);
			return upload;


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
				logError(error);
				if (numRetriesRemaining > 0) {
					numRetriesRemaining--;
					fileUpload = startUpload(queueItem);
					return;
				}
				queueItem.error = error;
				deferred.reject(error);
			}
		}

		function logError(error) {
			try {
				window.console.error(error);
			} catch (e) {
				window.console.log(error);
			}
		}
	}

	function uploadFile(file) {
		switch (adapterConfig.adapter) {
			case 'dropbox':
				return uploadDropboxFile(file, adapterConfig);
			case 'google':
				return uploadGoogleFile(file, adapterConfig);
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
			return xhr.upload({
				method: method,
				url: url,
				headers: headers,
				body: file.data
			});
		}

		function uploadGoogleFile(file, options) {
			var sitePath = options.path;
			var accessToken = options.token;
			var fullPath = path.join(sitePath, file.path);
			var parentPath = path.dirname(fullPath);
			var filename = path.basename(file.path);
			return ensureGoogleFolderExists(parentPath)
				.then(function(folderMetadata) {
					var parentFolderId = folderMetadata.id;
					return writeGoogleFile(filename, parentFolderId, file.data, accessToken)
						.then(function(fileMetadata) {
							var fileModel = parseGoogleFileMetadata(fileMetadata, parentPath);
							return fileModel;
						});
				});


			function ensureGoogleFolderExists(folderPath) {
				return self.retrieveFileMetadata('google', folderPath)
					.then(function(fileModel) {
						if (fileModel) {
							var isDirectory = fileModel.directory;
							if (!isDirectory) {
								return new $.Deferred().reject(new Error('File exists at ' + folderPath)).promise();
							}
							return fileModel;
						}
						return createFolderAtPath(folderPath);
					});


				function createFolderAtPath(folderPath) {
					var folderName = path.basename(folderPath);
					var parentPath = path.dirname(folderPath);
					return ensureGoogleFolderExists(parentPath)
						.then(function(folderMetadata) {
							var parentFolderId = folderMetadata.id;
							return createGoogleFolder(folderName, parentFolderId, { token: accessToken })
								.then(function(folderMetadata) {
									var fileModel = parseGoogleFileMetadata(folderMetadata, parentPath);
									return fileModel;
								});
						});
				}
			}

			function createGoogleFolder(folderName, parentFolderId, options) {
				options = options || {};
				var accessToken = options.token;
				return $.ajax(GOOGLE_CREATE_FOLDER_API_ENDPOINT, {
					type: GOOGLE_CREATE_FOLDER_API_METHOD,
					headers: {
						'Authorization': 'Bearer ' + accessToken
					},
					contentType: 'application/json',
					data: JSON.stringify({
						title: folderName,
						mimeType: MIME_TYPE_GOOGLE_FOLDER,
						parents: [
							{ id: parentFolderId }
						]
					}),
					dataType: 'json'
				});
			}

			function writeGoogleFile(filename, parentFolderId, data, accessToken) {
				var mimeType = data.type;
				var fileMetadata = {
					title: filename,
					mimeType: mimeType,
					parents: [
						{ id: parentFolderId }
					]
				};
				var deferred = new $.Deferred();
				var uploader = new GoogleUploader({
					token: accessToken,
					metadata: fileMetadata,
					file: data,
					onProgress: function(event) {
						if (!event.lengthComputable) { return; }
						deferred.notify({
							bytesLoaded: event.loaded,
							bytesTotal: event.total
						});
					},
					onComplete: function(response) {
						deferred.resolve(JSON.parse(response));
					},
					onError: function(error) {
						deferred.reject(error);
					}
				});
				uploader.upload();
				return deferred.promise();
			}

			function parseGoogleFileMetadata(fileMetadata, parentPath) {
				var isDirectory = getIsGoogleDirectory(fileMetadata);
				return new FileModel({
					id: fileMetadata.id,
					path: path.join(parentPath, fileMetadata.title),
					directory: isDirectory,
					mimeType: isDirectory ? null : fileMetadata.mimeType,
					size: fileMetadata.fileSize || 0,
					modified: fileMetadata.modifiedDate,
					thumbnail: fileMetadata.thumbnailLink
				});
			}

			function getIsGoogleDirectory(fileMetadata) {
				return (fileMetadata.mimeType === MIME_TYPE_GOOGLE_FOLDER);
			}
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
			return xhr.upload({
				method: method,
				url: url,
				headers: headers,
				body: file.data
			});
		}

		function getUploadUrl(endpoint, filePath, params) {
			var queryString = formatQueryString(params);
			var escapedPath = filePath.split('/').map(encodeURIComponent).join('/');
			var url = endpoint + escapedPath + (queryString ? '?' + queryString : '');
			return url;


			function formatQueryString(params) {
				return Object.keys(params).map(function(key) {
					return encodeURIComponent(key) + '=' + encodeURIComponent(params[key]);
				}).join('&');
			}
		}
	}
};

module.exports = Api;
