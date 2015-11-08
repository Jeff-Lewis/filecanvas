'use strict';

module.exports = function(element) {
	while (element.hasChildNodes()) {
		element.removeChild(element.firstChild);
	}
};
