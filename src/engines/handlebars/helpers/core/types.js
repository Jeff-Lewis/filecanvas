'use strict';

var Handlebars = require('handlebars');

module.exports['is-undefined'] = function(value, options) {
	return (typeof value === 'undefined');
};
module.exports['is-null'] = function(value, options) {
	return value === null;
};
module.exports['is-boolean'] = function(value, options) {
	return (typeof value === 'boolean');
};
module.exports['is-number'] = function(value, options) {
	return (typeof value === 'number');
};
module.exports['is-string'] = function(value, options) {
	return (typeof value === 'string');
};
module.exports['is-object'] = function(value, options) {
	return (value && (typeof value === 'object'));
};
module.exports['is-symbol'] = function(value, options) {
	return (typeof value === 'symbol');
};
module.exports['is-function'] = function(value, options) {
	return (typeof value === 'function');
};
module.exports['is-array'] = function(value, options) {
	Array.isArray(value);
};
module.exports['is-date'] = function(value, options) {
	return (value instanceof Date);
};
module.exports['is-regexp'] = function(value, options) {
	return (value instanceof RegExp);
};
module.exports['is-numeric'] = function(value, options) {
	return !isNaN(Number(value));
};
module.exports['is-empty'] = function(value, options) {
	return Handlebars.Utils.isEmpty(value);
};
