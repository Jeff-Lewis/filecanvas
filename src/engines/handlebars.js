'use strict';

var util = require('util');
var Handlebars = require('handlebars');

var helpers = require('./handlebars/helpers');
var TemplateService = require('../services/TemplateService');

var templateService = createHandlebarsTemplateService(helpers);

module.exports = function(templatePath, options, callback) {
	templateService.render(templatePath, options)
		.then(function(output) {
			callback(null, output);
		})
		.catch(function(error) {
			callback(error);
		});
};

function createHandlebarsTemplateService(helpers) {

	function HandlebarsTemplateService(helpers) {
		TemplateService.call(this);
		this.helpers = helpers || {};
	}

	util.inherits(HandlebarsTemplateService, TemplateService);

	HandlebarsTemplateService.prototype.helpers = null;

	HandlebarsTemplateService.prototype.compile = function(templateSource) {
		// Compile the template into a standard 2-arg Handlebars template function
		var templateFunction = compileHandlebarsTemplate(templateSource, this.helpers);

		// Convert the 2-arg template function into a 1-arg render function
		var renderFunction = function(options) {

			// Everything in the options hash gets passed as context
			var context = options;

			// Extract the Handlebars render options from the
			// special `_` property within the context hash
			var templateOptions = options._ || {};

			// Render the template
			var output = templateFunction(context, templateOptions);

			return output;
		};
		return renderFunction;


		function compileHandlebarsTemplate(templateSource, helpers) {
			var compiler = Handlebars.create();
			var rootContext = null;
			Object.keys(helpers).forEach(function(helperName) {
				var helper = helpers[helperName];
				compiler.registerHelper(helperName, function() {
					// HACK: allow the helpers to access the root context
					this['@root'] = rootContext;
					return helper.apply(this, arguments);
				});
			});
			var templateFunction = compiler.compile(templateSource);
			return function(context, templateOptions) {
				rootContext = context;
				return templateFunction(context, templateOptions);
			};
		}
	};

	return new HandlebarsTemplateService(helpers);
}
