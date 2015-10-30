'use strict';

var Handlebars = require('handlebars');

module.exports = function(templateSource, options) {
	options = options || {};
	var helpers = options.helpers || {};
	var compiler = Handlebars.create();
	Object.keys(helpers).forEach(function(helperName) {
		var helper = helpers[helperName];
		compiler.registerHelper(helperName, helper);
	});
	var templateFunction = compiler.compile(templateSource, {
		knownHelpers: helpers,
		knownHelpersOnly: true
	});
	return templateFunction;
};
