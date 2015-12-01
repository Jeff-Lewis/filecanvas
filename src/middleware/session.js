'use strict';

var express = require('express');

module.exports = function(options) {
	options = options || {};
	var cookieSecret = options.cookieSecret || null;

	if (!cookieSecret) { throw new Error('Missing cookie secret'); }

	var app = express();

	app.use(express.cookieParser());
	app.use(express.session({ secret: cookieSecret }));

	return app;
};
