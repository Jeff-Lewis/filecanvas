'use strict';

var path = require('path');

module.exports = function() {
	return function(req, res, next) {
		var pathPrefix = '/' + req.subdomains.join('/');
		req.url = (req.url === '/' ? pathPrefix : path.join(pathPrefix, req.url));
		next();
	};
};
