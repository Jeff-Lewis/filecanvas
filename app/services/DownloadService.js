module.exports = (function() {
	'use strict';

	function DownloadService(dropbox) {
		this.dropbox = dropbox;
	}

	DownloadService.prototype.dropbox = null;

	DownloadService.prototype.retrieveDownloadLink = function(path, callback) {
		var generateTemporaryUrl = true;
		this.dropbox.client.makeUrl(path, { download: generateTemporaryUrl }, _handleDownloadLinkRetrieved);


		function _handleDownloadLinkRetrieved(error, shareUrlModel) {
			if (error) { return error && callback(error); }
			return callback && callback(null, shareUrlModel.url);
		}
	};

	return DownloadService;
})();