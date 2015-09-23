'use strict';

var dotObject = require('dot-object');

module.exports = function() {
	return function(req, res, next) {
		req.body = parseNestedValues(req.body);
		next();
	};
};

function parseNestedValues(values) {
	return dotObject.object(values);
}
