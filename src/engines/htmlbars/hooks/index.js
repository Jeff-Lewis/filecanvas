'use strict';

var objectAssign = require('object-assign');
var Htmlbars = require('htmlbars/dist/cjs/htmlbars-runtime');

var keywords = require('../keywords');

var hooks = {
	bindSelf: require('./bindSelf')
};

module.exports = objectAssign({}, Htmlbars.hooks, hooks, {
	keywords: objectAssign({}, Htmlbars.hooks.keywords, keywords)
});
