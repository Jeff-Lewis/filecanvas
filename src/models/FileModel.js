'use strict';

function FileModel(options) {
	this.id = options.id;
	this.path = options.path;
	this.mimeType = options.mimeType;
	this.size = options.size;
	this.modified = options.modified;
	this.thumbnail = Boolean(options.thumbnail);
	this.directory = Boolean(options.directory);
	if (options.directory) {
		this.contents = options.contents ? options.contents.slice() : [];
	}
}

FileModel.prototype.id = null;
FileModel.prototype.path = null;
FileModel.prototype.mimeType = null;
FileModel.prototype.size = 0;
FileModel.prototype.modified = null;
FileModel.prototype.thumbnail = false;
FileModel.prototype.directory = false;
FileModel.prototype.contents = null;

module.exports = FileModel;
