'use strict';

var slug = require('slug');
var Handlebars = require('handlebars');

module.exports['replace'] = function(item1, item2, options) {
	return options.fn(this).replace(item1, item2);
};
module.exports['concat'] = function(item1, options) {
	var items = Array.prototype.slice.call(arguments, 0, -1);
	return items.join('');
};
module.exports['substr'] = function(value, start, length, options) {
	var args = Array.prototype.slice.call(arguments, 0, -1);
	length = args[2];
	return value.substr(start, length);
};
module.exports['startsWith'] = function(haystack, needle, options) {
	return haystack.indexOf(needle) === 0;
};
module.exports['escapeNewlines'] = function(value, options) {
	var safeValue = Handlebars.Utils.escapeExpression(value);
	var escapedValue = safeValue.replace(/\n/g, '&#10;').replace(/\r/g, '&#13;');
	return new Handlebars.SafeString(escapedValue);
};
module.exports['slug'] = function(value, options) {
	return slug(value, { lower: true });
};
