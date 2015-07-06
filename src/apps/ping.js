'use strict';

var express = require('express');

var invalidRoute = require('../middleware/invalidRoute');
var errorHandler = require('../middleware/errorHandler');

module.exports = function() {
	var app = express();

	app.get('/', function(req, res) {
		res.send(204);
	});

	app.use(invalidRoute());
	app.use(errorHandler({
		template: 'error'
	}));

	return app;
};
