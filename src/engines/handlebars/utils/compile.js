'use strict';

var Handlebars = require('handlebars');

module.exports = function(templateSource, options) {
	options = options || {};
	var helpers = options.helpers || {};
	var compiler = Handlebars.create();
	var rootContext = null;
	Object.keys(helpers).forEach(function(helperName) {
		var helper = helpers[helperName];
		compiler.registerHelper(helperName, function() {
			// HACK: allow the helpers to access the root context
			Object.defineProperty(this, '@root', {
				value: rootContext,
				enumerable: false
			});
			return helper.apply(this, arguments);
		});
	});
	var templateFunction = compiler.compile(templateSource);
	return function(context, templateOptions) {
		rootContext = context;
		return templateFunction(context, templateOptions);
	};
};
