(function() {
	'use strict';

	function Shunt() {}

	Shunt.prototype.purgeSiteCache = function(siteAlias, callback) {
		var url = '/sites/' + siteAlias;
		var settings = {
			type: 'POST',
			beforeSend: function(xhr){
				xhr.setRequestHeader('X-HTTP-Method-Override', 'PUT');
			},
			data: { '_action': 'purge' },
			success: onCachePurgeCompleted,
			error: onCachePurgeFailed
		};
		$.ajax(url, settings);


		function onCachePurgeCompleted() {
			return callback && callback(null);
		}

		function onCachePurgeFailed(jqXHR, textStatus, errorThrown) {
			var error = new Error(errorThrown);
			return callback && callback(error);
		}
	};

	window.shunt = new Shunt();
})();
