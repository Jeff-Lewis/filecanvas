'use strict';

var Handlebars = require('handlebars');

module.exports['concat'] = function(item1, options) {
	var items = Array.prototype.slice.call(arguments, 0, -1);
	return items.join('');
};
module.exports['substr'] = function(value, start, length, options) {
	var args = Array.prototype.slice.call(arguments, 0, -1);
	length = args[2];
	return value.substr(start, length);
};
module.exports['replace'] = function(value, pattern, replacement, options) {
	var sourceIsSafeString = (typeof value.toHTML === 'function');
	var replacementIsSafeString = (typeof replacement.toHTML === 'function');
	if (!sourceIsSafeString && !replacementIsSafeString) {
		return value.replace(pattern, replacement);
	} else if (sourceIsSafeString && replacementIsSafeString) {
		value = value.toString();
		replacement = replacement.toString();
		return new Handlebars.SafeString(value.replace(pattern, replacement));
	} else {
		var segments = value.split(pattern);
		var lhs = segments[0];
		var rhs = value.substr(lhs.length + pattern.length);
		if (sourceIsSafeString) {
			return new Handlebars.SafeString(lhs + Handlebars.Utils.escapeExpression(replacement) + rhs);
		} else {
			return new Handlebars.SafeString(Handlebars.Utils.escapeExpression(lhs) + replacement + Handlebars.Utils.escapeExpression(rhs));
		}
	}
};
module.exports['startsWith'] = function(haystack, needle, options) {
	return haystack.indexOf(needle) === 0;
};
module.exports['wrap'] = function(value, left, right, options) {
	return new Handlebars.SafeString(left + Handlebars.Utils.escapeExpression(value) + right);
};
module.exports['escapeNewlines'] = function(value, options) {
	var safeValue = Handlebars.Utils.escapeExpression(value);
	var escapedValue = safeValue.replace(/\n/g, '&#10;').replace(/\r/g, '&#13;');
	return new Handlebars.SafeString(escapedValue);
};
