'use strict';

function DownloadService(dropboxService) {
	this.dropboxService = dropboxService;
}

DownloadService.prototype.dropboxService = null;

DownloadService.prototype.retrieveDownloadLink = function(path) {
	var self = this;
	return new Promise(function(resolve, reject) {
		var generateTemporaryUrl = true;
		self.dropboxService.client.makeUrl(path, { download: generateTemporaryUrl },
			function(error, shareUrlModel) {
				if (error) { return reject(error); }
				return resolve(shareUrlModel.url);
			}
		);
	});
};

module.exports = DownloadService;
