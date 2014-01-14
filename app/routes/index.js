module.exports = (function() {
	'use strict';

	var express = require('express');
	var app = express();

	app.get('/', function(req, res) {
		res.send('<!DOCTYPE html><html><head><meta charset="utf-8"/><title>webfolder.io</title></head><body><h1>webfolder.io</h1></body></html>');
	});

	return app;
})();