'use strict';

var util = require('util');
var express = require('express');

var LoginAdapter = require('./LoginAdapter');

function GoogleLoginAdapter(database, options) {
	options = options || {};
	var isPersistent = options.persistent || null;

	LoginAdapter.call(this, database, {
		persistent: isPersistent
	});
}

util.inherits(GoogleLoginAdapter, LoginAdapter);

GoogleLoginAdapter.prototype.adapterName = 'google';

GoogleLoginAdapter.prototype.middleware = function(passport, passportOptions, callback) {
	var app = express();

	app.use(function(req, res, next) {
		next(new Error('Not implemented'));
	});

	return app;
};

function GoogleStorageAdapter(database, options) {
	options = options || {};

	if (!database) { throw new Error('Missing database'); }

	this.database = database;
}

GoogleStorageAdapter.prototype.database = null;

GoogleStorageAdapter.prototype.getMetadata = function(adapterConfig) {
	throw new Error('Not implemented');
};

GoogleStorageAdapter.prototype.createFolder = function(folderPath, options) {
	return Promise.reject('Not implemented');
};

GoogleStorageAdapter.prototype.initSiteFolder = function(sitePath, siteFiles, options) {
	return Promise.reject('Not implemented');
};

GoogleStorageAdapter.prototype.loadFolderContents = function(folderPath, options) {
	return Promise.reject('Not implemented');
};

GoogleStorageAdapter.prototype.retrieveFileMetadata = function(filePath, options) {
	return Promise.reject('Not implemented');
};

GoogleStorageAdapter.prototype.retrieveDownloadLink = function(filePath, options) {
	return Promise.reject('Not implemented');
};

GoogleStorageAdapter.prototype.retrieveThumbnailLink = function(filePath, options) {
	return Promise.reject('Not implemented');
};

GoogleStorageAdapter.prototype.getUploadConfig = function(sitePath, options) {
	throw new Error('Not implemented');
};

module.exports = {
	LoginAdapter: GoogleLoginAdapter,
	StorageAdapter: GoogleStorageAdapter
};
