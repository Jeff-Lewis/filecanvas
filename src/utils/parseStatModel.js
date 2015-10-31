'use strict';

var mime = require('mime');
var Mode = require('stat-mode');

var FileModel = require('../models/FileModel');

module.exports = function(stat, filePath) {
	var mimeType = stat.isFile() ? mime.lookup(filePath) : null;
	var hasThumbnail = Boolean(mimeType) && mimeType.split('/')[0] === 'image';
	var ownerCanWrite = new Mode(stat).owner.write;
	var isDirectory = stat.isDirectory();
	var fileMetaData = {
		path: filePath,
		mimeType: mimeType,
		size: stat.size,
		modified: stat.mtime.toUTCString(),
		readOnly: !ownerCanWrite,
		thumbnail: hasThumbnail,
		directory: isDirectory
	};
	return new FileModel(fileMetaData);
};
