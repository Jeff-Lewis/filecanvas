module.exports = (function() {
	'use strict';

	function DownloadService(dropboxService) {
		this.dropboxService = dropboxService;
	}

	DownloadService.prototype.dropboxService = null;

	DownloadService.prototype.retrieveDownloadLink = function(path, callback) {
		var generateTemporaryUrl = true;
		this.dropboxService.client.makeUrl(path, { download: generateTemporaryUrl }, _handleDownloadLinkRetrieved);


		function _handleDownloadLinkRetrieved(error, shareUrlModel) {
			if (error) { return error && callback(error); }
			return callback && callback(null, shareUrlModel.url);
		}
	};

	return DownloadService;
})();
