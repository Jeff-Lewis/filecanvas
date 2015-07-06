'use strict';

var HttpError = require('../errors/HttpError');

module.exports = function(options) {
	options = options || {};

	var isProduction = process.env.NODE_ENV === 'production';
	if (!isProduction) {
		return function(req, res, next) {
			next(new HttpError(404, req.url));
		};
	}

	return function(req, res, next) {
		next(new HttpError(404));
	};
};
