'use strict';

module.exports = function() {
	return function(req, res, next) {
		req.body = parseNestedValues(req.body);
		console.log('Request body:', req.body);
		next();
	};
};

function parseNestedValues(values) {
	return Object.keys(values).map(function(key) {
		return {
			key: key,
			value: values[key]
		};
	}).reduce(function(values, property) {
		var propertyName = property.key;
		var propertyValue = property.value;
		var propertyNameSegments = propertyName.split('.');
		propertyNameSegments.reduce(function(parent, propertyNameSegment, index, array) {
			if (index === array.length - 1) {
				parent[propertyNameSegment] = propertyValue;
				return propertyValue;
			}
			if (!(propertyNameSegment in parent)) {
				parent[propertyNameSegment] = {};
			}
			return parent[propertyNameSegment];
		}, values);
		return values;
	}, {});
}
