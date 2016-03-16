'use strict';

var path = require('path');
var bindingFilters = require('./filters');

module.exports = {
	'notEmpty': function(value) {
		return Boolean(value);
	},
	'notEqualTo': function(value, args) {
		var items = Array.prototype.slice.call(arguments, 1);
		return items.every(function(item) {
			return (value !== item);
		});
	},
	'startsWith': function(value, string) {
		return Boolean(value) && (value.substr(0, string.length) === string);
	},
	'endsWith': function(value, string) {
		return Boolean(value) && (value.substr(-string.length) === string);
	},
	'email': function(value) {
		return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,4}$/.test(value);
	},
	'domain': function(value) {
		return /^(?!:\/\/)([a-z0-9]+\.)?[a-z0-9][a-z0-9-]+\.[a-z]{2,6}?$/.test(value);
	},
	'slug': function(value) {
		return (value === bindingFilters['slug'](value));
	},
	'path': function(value) {
		return (value === '') || (value === path.normalize(value));
	},
	'filename': function(value) {
		return (value === bindingFilters['filename'](value));
	}
};
