'use strict';

var express = require('express');

module.exports = function(options) {
	options = options || {};
	var siteRoot = options.siteRoot;

	if (!siteRoot) { throw new Error('Missing site root'); }

	var app = express();

	app.use(express.static(siteRoot, { redirect: false }));

	return app;
};
