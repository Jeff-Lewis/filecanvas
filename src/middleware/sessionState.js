'use strict';

var merge = require('lodash.merge');

module.exports = function() {
	return function(req, res, next) {
		if (req.body._state) {
			req.session.state = merge({}, req.session.state, req.body._state);
		}
		next();
	};
};
