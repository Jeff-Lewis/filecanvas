'use strict';

var express = require('express');
var RedisStore = require('connect-redis')(express.session);

module.exports = function(options) {
	options = options || {};
	var cookieSecret = options.cookieSecret || null;
	var redisUrl = options.store || null;
	var sessionDuration = options.ttl || null;

	if (!cookieSecret) { throw new Error('Missing cookie secret'); }
	if (!redisUrl) { throw new Error('Missing session store URL'); }
	if (!sessionDuration) { throw new Error('Missing session duration'); }

	var app = express();

	app.use(express.cookieParser());
	app.use(express.session({
		store: new RedisStore({ url: redisUrl, ttl: sessionDuration }),
		secret: cookieSecret
	}));
	app.use(function(req, res, next) {
		if (!req.session) {
			return next(new Error('Unable to initialize session store'));
		}
		next();
	});

	return app;
};
