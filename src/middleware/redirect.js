'use strict';

module.exports = function(redirectPath) {
	return function(req, res, next) {
		res.redirect(redirectPath);
	};
};
