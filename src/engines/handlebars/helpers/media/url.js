'use strict';

var slug = require('slug');

module.exports['slug'] = function(value, options) {
	return slug(value, { lower: true });
};
