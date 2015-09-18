'use strict';

var merge = require('lodash.merge');

module.exports = function() {
	return function(req, res, next) {
		req.session.state = merge({}, req.session.state, req.body._state);
		console.log('Session state:', req.session.state);
		next();
	};
};
