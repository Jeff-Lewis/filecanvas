'use strict';

var HttpError = require('../errors/HttpError');

module.exports = function(options) {
	options = options || {};

	return function(req, res, next) {
		next(new HttpError(404));
	};
};
