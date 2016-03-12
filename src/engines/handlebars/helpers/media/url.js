'use strict';

var url = require('url');
var slug = require('slug');

module.exports['url'] = function(value, options) {
	var hasProtocol = Boolean(url.parse(value).protocol);
	return (hasProtocol ? value : 'http://' + value);
};

module.exports['slug'] = function(value, options) {
	return slug(value, { lower: true });
};
