(function() {
	'use strict';

	function Shunt() {}

	Shunt.prototype.purgeSiteCache = function(siteAlias) {
		var url = '/sites/' + siteAlias;
		var settings = {
			type: 'POST',
			beforeSend: function(xhr){
				xhr.setRequestHeader('X-HTTP-Method-Override', 'PUT');
			},
			data: {
				'_action': 'purge'
			}
		};
		return $.ajax(url, settings)
			.then(function(data, textStatus, jqXHR) {
				return new $.Deferred().resolve().promise();
			})
			.fail(function(jqXHR, textStatus, errorThrown) {
				return new $.Deferred().reject(new Error(errorThrown)).promise();
			});
	};

	Shunt.prototype.validateDropboxFolder = function(path) {
		if (!path || (path.charAt(0) !== '/')) {
			return new $.Deferred().resolve(false).promise();
		}
		var url = '/dropbox/metadata' + path;
		var settings = {
			type: 'GET',
			dataType: 'json'
		};
		return $.ajax(url, settings)
			.then(function(data, textStatus, jqXHR) {
				var isValidFolder = data && data.is_dir && !data.is_deleted;
				return isValidFolder;
			})
			.fail(function(jqXHR, textStatus, errorThrown) {
				return new $.Deferred().reject(new Error(errorThrown)).promise();
			});
	};

	window.shunt = new Shunt();
})();
