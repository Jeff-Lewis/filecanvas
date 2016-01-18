'use strict';

var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

module.exports['timestamp'] = function(value, options) {
	if (!value) { return null; }
	var date = new Date(value);
	return Math.floor(date.getTime() / 1000);
};
module.exports['date'] = function(value, options) {
	if (!value) { return null; }
	var date = new Date(value);
	return DAYS[date.getUTCDay()] + ' ' + date.getUTCDate() + ' ' + MONTHS[date.getUTCMonth()] + ' ' + date.getUTCFullYear();
};
