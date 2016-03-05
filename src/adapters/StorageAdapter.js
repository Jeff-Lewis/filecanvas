'use strict';

function StorageAdapter() {
}

StorageAdapter.prototype.adapterName = null;

StorageAdapter.prototype.getMetadata = function(adapterConfig) {
	throw new Error('Not implemented');
};

StorageAdapter.prototype.createFolder = function(folderPath, options) {
	return Promise.reject(new Error('Not implemented'));
};

StorageAdapter.prototype.initSiteFolder = function(sitePath, siteFiles, options) {
	return Promise.reject(new Error('Not implemented'));
};

StorageAdapter.prototype.loadFolderContents = function(folderPath, options) {
	return Promise.reject(new Error('Not implemented'));
};

StorageAdapter.prototype.readFile = function(filePath, siteRoot, options) {
	return Promise.reject(new Error('Not implemented'));
};

StorageAdapter.prototype.retrieveDownloadLink = function(filePath, siteRoot, options) {
	return Promise.reject(new Error('Not implemented'));
};

StorageAdapter.prototype.retrievePreviewLink = function(filePath, siteRoot, options) {
	return Promise.reject(new Error('Not implemented'));
};

StorageAdapter.prototype.retrieveThumbnailLink = function(filePath, siteRoot, options) {
	return Promise.reject(new Error('Not implemented'));
};

StorageAdapter.prototype.retrieveFileMetadata = function(filePath, options) {
	return Promise.reject(new Error('Not implemented'));
};

StorageAdapter.prototype.getUploadConfig = function(sitePath, siteRoot, options) {
	throw new Error('Not implemented');
};

module.exports = StorageAdapter;
