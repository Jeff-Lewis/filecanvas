module.exports = (function() {
	'use strict';

	var express = require('express');
	var app = express();

	app.get('/', function(req, res) {
		res.send('<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><title>Dropkick</title></head><body><h1>Dropkick</h1><h2>Share your files to the web instantly and securely</h2></body></html>');
	});

	return app;
})();
