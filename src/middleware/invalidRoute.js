'use strict';

var HttpError = require('../errors/HttpError');

module.exports = function() {

	return function(req, res, next) {
		next(new HttpError(404));
	};
};
