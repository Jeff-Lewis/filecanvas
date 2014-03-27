/* jshint jquery: true */
(function() {
	'use strict';

	var Dropkick = (function() {

		function Dropkick() {}

		Dropkick.prototype.purgeSiteCache = function(siteAlias, callback) {
			var url = '/sites/' + siteAlias;
			var settings = {
				type: 'POST',
				data: { '_method': 'PUT', '_action': 'purge' },
				success: _handleCachePurgeCompleted,
				error: _handleCachePurgeFailed
			};
			$.ajax(url, settings);


			function _handleCachePurgeCompleted() {
				return callback && callback(null);
			}

			function _handleCachePurgeFailed(jqXHR, textStatus, errorThrown) {
				var error = new Error(errorThrown);
				return callback && callback(error);
			}
		};

		return Dropkick;
	})();

	window.dropkick = new Dropkick();

})();