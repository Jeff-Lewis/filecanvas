'use strict';

module.exports = function(iframeElement) {
	return (iframeElement.contentDocument || iframeElement.contentWindow.document);
};
