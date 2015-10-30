'use strict';

var Handlebars = require('handlebars');

module.exports['is-array'] = function(value, options) {
	return Handlebars.Utils.isArray(value);
};
