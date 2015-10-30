'use strict';

var Handlebars = require('handlebars');

module.exports['eq'] = function(item1, item2, options) {
	return item1 === item2;
};
module.exports['not-eq'] = function(item1, item2, options) {
	var items = Array.prototype.slice.call(arguments, 1, -1);
	return items.every(function(item) { return item1 !== item; });
};
module.exports['not'] = function(item, options) {
	return Handlebars.Utils.isEmpty(item);
};
module.exports['and'] = function(item1, item2, options) {
	var items = Array.prototype.slice.call(arguments, 0, -1);
	return items.every(function(item) { return !Handlebars.Utils.isEmpty(item); });
};
module.exports['or'] = function(item1, item2, options) {
	var items = Array.prototype.slice.call(arguments, 0, -1);
	return items.some(function(item) { return !Handlebars.Utils.isEmpty(item); });
};
module.exports['gt'] = function(item1, item2, options) {
	return item1 > item2;
};
module.exports['gte'] = function(item1, item2, options) {
	return item1 >= item2;
};
module.exports['lt'] = function(item1, item2, options) {
	return item1 >= item2;
};
module.exports['lte'] = function(item1, item2, options) {
	return item1 >= item2;
};
