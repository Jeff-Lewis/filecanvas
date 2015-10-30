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
				enumerable: false,
				configurable: true
			});

			// Invoke the helper with the modified `this` object
			var output = helper.apply(this, arguments);

			// Reset the `this` object to its unmodified state
			delete this['@root'];

			return output;
		});
	});
	var templateFunction = compiler.compile(templateSource);
	return function(context, templateOptions) {
		rootContext = context;
		return templateFunction(context, templateOptions);
	};
};
