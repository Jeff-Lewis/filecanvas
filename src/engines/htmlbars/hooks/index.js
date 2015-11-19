'use strict';

var merge = require('lodash.merge');
var Htmlbars = require('htmlbars/dist/cjs/htmlbars-runtime');

var keywords = require('../keywords');

var hooks = {
	bindSelf: require('./bindSelf')
};

module.exports = merge({}, Htmlbars.hooks, hooks, {
	keywords: keywords
});
