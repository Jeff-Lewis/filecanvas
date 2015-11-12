'use strict';

var objectAssign = require('object-assign');

var emberKeywords = require('@timkendrick/ember-htmlbars-helpers').keywords;

var keywords = {
	script: require('./script')
};

module.exports = objectAssign({}, emberKeywords, keywords);
