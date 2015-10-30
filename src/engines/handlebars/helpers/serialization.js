'use strict';

module.exports['json'] = function(value, indent, options) {
	return JSON.stringify(value, null, indent);
};
