'use strict';

var emberHelpers = require('@timkendrick/ember-htmlbars-helpers').helpers;

module.exports = {
	if: function(params, hash, options) {
		if (!options.template) { options.template = {}; }
		if (!options.inverse) { options.inverse = {}; }
		return emberHelpers.if(params, hash, options);
	},
	unless: function(params, hash, options) {
		if (!options.template) { options.template = {}; }
		if (!options.inverse) { options.inverse = {}; }
		return emberHelpers.unless(params, hash, options);
	}
};
