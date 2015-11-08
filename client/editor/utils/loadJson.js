'use strict';

module.exports = function(url) {
	return $.ajax({
		url: url,
		dataType: 'json',
		headers: {
			'Accept': 'application/json'
		}
	})
		.then(function(data, textStatus, jqXHR) {
			return new $.Deferred().resolve(data).promise();
		})
		.fail(function(jqXHR, textStatus, errorThrown) {
			return new $.Deferred().reject(new Error(errorThrown)).promise();
		});
};
