'use strict';

var express = require('express');
var cors = require('cors');

module.exports = function(options) {
	options = options || {};
	var adminAssetsPath = options.adminAssetsPath;

	if (!adminAssetsPath) { throw new Error('Missing admin assets path'); }

	var app = express();

	app.use(cors());

	app.use('/admin', express.static(adminAssetsPath, { redirect: false }));

	return app;
};
