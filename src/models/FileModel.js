'use strict';

function FileModel(options) {
	this.id = options.id || null;
	this.path = options.path || null;
	this.mimeType = options.mimeType || null;
	this.size = options.size || 0;
	this.modified = options.modified || new Date().toISOString();
	this.thumbnail = (typeof options.thumbnail === 'string' ? options.thumbnail : Boolean(options.thumbnail));
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
