'use strict';

var objectAssign = require('object-assign');

var keywordModules = [];

var keywords = keywordModules.reduce(function(keywords, module) {
	return objectAssign(keywords, module);
}, {});

module.exports = keywords;
