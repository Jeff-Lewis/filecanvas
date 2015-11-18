'use strict';

module.exports = function(scriptUrl, parentElement) {
	parentElement = parentElement || document.head;
	var scriptElement = document.createElement('script');
	var deferred = new $.Deferred();
	scriptElement.addEventListener('load', function(event) {
		deferred.resolve(scriptElement);
	});
	scriptElement.addEventListener('error', function(event) {
		deferred.reject();
	});
	scriptElement.src = scriptUrl;
	parentElement.appendChild(scriptElement);
	return deferred.promise();
};
