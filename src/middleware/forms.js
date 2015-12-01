'use strict';

var express = require('express');
var methodOverride = require('method-override');
var dotObject = require('dot-object');

module.exports = function() {
	var app = express();

	initBodyParser(app);
	initNestedForms(app);
	initMethodOverride(app);

	return app;


	function initBodyParser(app) {
		app.use(express.json());
		app.use(express.urlencoded());
		app.use(disableArrayFields);

		function disableArrayFields(req, res, next) {
			req.body = flattenArrayFields(req.body);
			req.query = flattenArrayFields(req.query);
			next();

			function flattenArrayFields(values) {
				return Object.keys(values).reduce(function(flattenedValues, key) {
					var value = values[key];
					var isArrayField = Array.isArray(value);
					if (isArrayField) {
						var lastArrayItem = value[value.length - 1];
						flattenedValues[key] = lastArrayItem;
					} else {
						flattenedValues[key] = value;
					}
					return flattenedValues;
				}, {});
			}
		}
	}

	function initMethodOverride(app) {
		app.use(methodOverride(function(req, res) {
			if (req.body && req.body._method) {
				var method = req.body._method;
				delete req.body._method;
				if (method === 'GET') {
					Object.keys(req.body).forEach(function(key) {
						req.query[key] = req.body[key];
						delete req.body[key];
					});
				}
				return method;
			}
		}));
		app.use(methodOverride('X-HTTP-Method-Override'));
	}

	function initNestedForms(app) {
		app.use(function(req, res, next) {
			req.query = parseNestedValues(req.query);
			req.body = parseNestedValues(req.body);
			next();
		});

		function parseNestedValues(values) {
			return dotObject.object(values);
		}
	}
};
