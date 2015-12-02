'use strict';

var express = require('express');

module.exports = function(passport, options) {
	options = options || {};
	var failureRedirect = options.failureRedirect;
	var adapters = options.adapters;

	if (!failureRedirect) { throw new Error('Missing failure redirect'); }
	if (!adapters) { throw new Error('Missing adapters'); }

	var app = express();

	initAdapters(app, passport);

	return app;


	function initAdapters(app, passport) {
		Object.keys(adapters).forEach(function(key) {
			var adapterName = key;
			var adapter = adapters[key];
			app.post('/' + adapterName, function(req, res, next) {
				delete req.session.loginRedirect;
				if (req.body.redirect) {
					req.session.loginRedirect = req.body.redirect;
				}
				next();
			});
			var loginMiddleware = adapter.middleware(passport, { failureRedirect: failureRedirect }, function(req, res) {
				req.session.adapter = adapterName;
				var redirectUrl = req.session.loginRedirect;
				delete req.session.loginRedirect;
				res.redirect(redirectUrl || '/');
			});
			app.use('/' + adapterName, loginMiddleware);
		});
	}
};
