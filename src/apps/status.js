'use strict';

var express = require('express');

var invalidRoute = require('../middleware/invalidRoute');

module.exports = function() {
	var app = express();

	app.get('/', function(req, res) {
		res.send(204);
	});
	initErrorHandler(app);

	return app;


	function initErrorHandler(app) {
		app.use(invalidRoute());
	}
};
