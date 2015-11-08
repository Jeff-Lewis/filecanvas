'use strict';

var getIframeDomElement = require('./getIframeDomElement');

module.exports = function onIframeDomReady(iframeElement) {
	var deferred = new $.Deferred();
	var iframeDocumentElement = getIframeDomElement(iframeElement);
	var isEmptyDocument = getIsEmptyDocument(iframeDocumentElement);
	if (isEmptyDocument) {
		// HACK: See Webkit bug #33604 (https://bugs.webkit.org/show_bug.cgi?id=33604)
		// Sometimes the iframe does not yet contain the correct document,
		// so we need to poll until the current document is the correct one
		var pollInterval = 50;
		setTimeout(
			function() {
				onIframeDomReady(iframeElement)
					.then(function(documentElement) {
						deferred.resolve(documentElement);
					});
			},
			pollInterval
		);
	} else {
		deferred.resolve(iframeDocumentElement);
	}
	return deferred.promise();


	function getIsEmptyDocument(documentElement) {
		return !documentElement.documentElement;
	}
};
