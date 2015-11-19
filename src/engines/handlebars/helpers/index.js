'use strict';

var objectAssign = require('object-assign');

var helperModules = [
	require('./array'),
	require('./css'),
	require('./date'),
	require('./index'),
	require('./logic'),
	require('./markdown'),
	require('./path'),
	require('./serialization'),
	require('./site'),
	require('./string')
];

var helpers = helperModules.reduce(function(helpers, module) {
	return objectAssign(helpers, module);
}, {});

module.exports = helpers;
