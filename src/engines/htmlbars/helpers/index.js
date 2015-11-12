'use strict';

var objectAssign = require('object-assign');
var emberHelpers = require('@timkendrick/ember-htmlbars-helpers').helpers;
var handlebarsHelpers = require('../../handlebars/helpers');

var convertedHandlebarsHelpers = Object.keys(handlebarsHelpers).reduce(function(helpers, helperName) {
	var handlebarsHelper = handlebarsHelpers[helperName];
	helpers[helperName] = function(params, hash, blocks) {
		return handlebarsHelper.apply(this, params.concat(blocks));
	};
	return helpers;
}, {});

var helpers = {
	'if': require('./if_unless').if,
	'unless': require('./if_unless').unless
};

module.exports = objectAssign({}, emberHelpers, helpers, convertedHandlebarsHelpers);
