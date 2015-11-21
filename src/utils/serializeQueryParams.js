'use strict';

module.exports = function(params) {
	return Object.keys(params).map(function(key) {
		var value = params[key];
		var serializedValue = serializeValue(value);
		return (serializedValue ? key + '=' + encodeURIComponent(serializedValue) : null);
	}).filter(function(segment) {
		return Boolean(segment);
	}).join('&');
};

function serializeValue(value) {
	switch (typeof value) {
		case 'undefined': return null;
		case 'boolean': return value.toString();
		case 'string': return value;
		case 'number': return value.toString();
		case 'object': return (value === null ? null : JSON.stringify(value));
		default: throw new Error('Invalid query parameter: ' + value);
	}
}
