'use strict';

var path = require('path');
var loadImage = require('blueimp-load-image/js/load-image');
var objectAssign = require('object-assign');

module.exports = function(file, options) {
	options = options || {};
	var imageFormat = options.format || file.type;
	var imageQuality = options.quality;
	var imageOptions = options.options;

	var deferred = new $.Deferred();
	var loadImageOptions = objectAssign({}, imageOptions, { canvas: true });
	loadImage(file, function(canvasElement) {
		if (!canvasElement.toBlob) { canvasElement.toBlob = toBlob; }
		canvasElement.toBlob(function(blob) {
			var processedMimeType = imageFormat;
			var processedFilename = updateFileExtension(file.name, processedMimeType);
			var processedFile = new File([blob], processedFilename, { type: processedMimeType });
			deferred.resolve(processedFile);
		}, imageFormat, imageQuality);
	}, loadImageOptions);
	return deferred.promise();


	function toBlob(callback, type, quality) {
		var xhr = new XMLHttpRequest();
		xhr.open('GET', this.toDataURL(type, quality));
		xhr.responseType = 'arraybuffer';
		xhr.addEventListener('load', function(event) {
			callback(new Blob([this.response], { type: type || 'image/png' }));
		});
		xhr.send();
	}

	function updateFileExtension(filename, mimeType) {
		return path.basename(filename, path.extname(filename)) + getMimeExtension(mimeType);


		function getMimeExtension(mimeType) {
			switch (mimeType) {
				case 'image/png':
					return '.png';
				case 'image/jpeg':
					return '.jpg';
				default:
					return '.' + mimeType.split('/')[1];
			}
		}
	}
};
