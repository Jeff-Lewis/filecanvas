'use strict';

var crypto = require('crypto');
var express = require('express');
var methodOverride = require('method-override');

module.exports = function() {
	var app = express();
	initSessions(app);
	initForms(app);
	return app;


	function initSessions(app) {
		app.use(express.cookieParser());
		app.use(express.session({ secret: generateRandomBase64String(128) }));
	}

	function initForms(app) {
		initBodyParser(app);
		initMethodOverride(app);

		function initBodyParser(app) {
			app.use(express.json());
			app.use(express.urlencoded());
			app.use(disableArrayFields);

			function disableArrayFields(req, res, next) {
				Object.keys(req.body).forEach(function(key) {
					var value = req.body[key];
					var isArrayField = Array.isArray(value);
					if (isArrayField) {
						var lastArrayItem = value[value.length - 1];
						req.body[key] = lastArrayItem;
					}
				});
				next();
			}
		}

		function initMethodOverride(app) {
			app.use(methodOverride(function(req, res) {
				if (req.body && req.body._method) {
					var method = req.body._method;
					delete req.body._method;
					return method;
				}
			}));
			app.use(methodOverride('X-HTTP-Method-Override'));
		}
	}


	function generateRandomBase64String(numBytes) {
		return crypto.randomBytes(numBytes).toString('base64');
	}
};
