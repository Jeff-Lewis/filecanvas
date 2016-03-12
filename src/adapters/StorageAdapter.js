'use strict';

function StorageAdapter() {
}

StorageAdapter.prototype.adapterName = null;

StorageAdapter.prototype.getMetadata = function(userAdapterConfig) {
	throw new Error('Not implemented');
};

StorageAdapter.prototype.initSiteFolder = function(siteFiles, siteAdapterConfig, userAdapterConfig) {
	return Promise.reject(new Error('Not implemented'));
};

StorageAdapter.prototype.loadSiteContents = function(siteAdapterConfig, userAdapterConfig) {
	return Promise.reject(new Error('Not implemented'));
};

StorageAdapter.prototype.readFile = function(filePath, siteAdapterConfig, userAdapterConfig) {
	return Promise.reject(new Error('Not implemented'));
};

StorageAdapter.prototype.retrieveDownloadLink = function(filePath, siteAdapterConfig, userAdapterConfig) {
	return Promise.reject(new Error('Not implemented'));
};

StorageAdapter.prototype.retrievePreviewLink = function(filePath, siteAdapterConfig, userAdapterConfig) {
	return Promise.reject(new Error('Not implemented'));
};

StorageAdapter.prototype.retrieveThumbnailLink = function(filePath, siteAdapterConfig, userAdapterConfig) {
	return Promise.reject(new Error('Not implemented'));
};

StorageAdapter.prototype.retrieveFileMetadata = function(filePath, userAdapterConfig) {
	return Promise.reject(new Error('Not implemented'));
};

StorageAdapter.prototype.getUploadConfig = function(sitePath, siteAdapterConfig, userAdapterConfig) {
	throw new Error('Not implemented');
};

module.exports = StorageAdapter;
