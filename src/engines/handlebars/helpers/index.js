'use strict';

var objectAssign = require('object-assign');

var helperModules = [
	require('./array'),
	require('./date'),
	require('./file'),
	require('./index'),
	require('./logic'),
	require('./markdown'),
	require('./serialization'),
	require('./site'),
	require('./string')
];

var helpers = helperModules.reduce(function(helpers, module) {
	return objectAssign(helpers, module);
}, {});

module.exports = helpers;
