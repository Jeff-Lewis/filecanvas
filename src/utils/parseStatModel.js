'use strict';

var mime = require('mime');
var Mode = require('stat-mode');

var FileModel = require('../models/FileModel');

module.exports = function(stat, filePath) {
	var ownerCanWrite = new Mode(stat).owner.write;
	var fileMetaData = {
		path: filePath,
		mimeType: stat.isFile() ? mime.lookup(filePath) : null,
		size: stat.size,
		modified: stat.mtime,
		readOnly: !ownerCanWrite,
		thumbnail: false,
		directory: stat.isDirectory()
	};
	return new FileModel(fileMetaData);
};
