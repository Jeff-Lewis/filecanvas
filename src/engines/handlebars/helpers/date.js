'use strict';

module.exports['timestamp'] = function(value, options) {
	return (value ? Math.floor(value.getTime() / 1000) : null);
};
module.exports['date'] = function(value, options) {
	var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dev'];
	return DAYS[value.getDay()] + ' ' + value.getDate() + ' ' + MONTHS[value.getMonth()] + ' ' + value.getFullYear();
};
