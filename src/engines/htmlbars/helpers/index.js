'use strict';

var objectAssign = require('object-assign');

var emberHelpers = require('@timkendrick/ember-htmlbars-helpers');
var handlebarsHelpers = require('../../handlebars/helpers');

var convertedHandlebarsHelpers = Object.keys(handlebarsHelpers).reduce(function(helpers, helperName) {
	var handlebarsHelper = handlebarsHelpers[helperName];
	helpers[helperName] = function(params, hash, blocks) {
		return handlebarsHelper.apply(this, params.concat(blocks));
	};
	return helpers;
}, {});

module.exports = objectAssign(emberHelpers, convertedHandlebarsHelpers);
