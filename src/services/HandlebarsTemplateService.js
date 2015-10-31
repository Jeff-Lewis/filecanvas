'use strict';

var util = require('util');
var Handlebars = require('handlebars');

var TemplateService = require('./TemplateService.js');

function HandlebarsTemplateService(options) {
	options = options || {};
	TemplateService.call(this, {
		fileCache: options.fileCache || null
	});

	this.helpers = options.helpers || {};
	this.compilerOptions = options.compiler || {};
}

util.inherits(HandlebarsTemplateService, TemplateService);

HandlebarsTemplateService.prototype.helpers = null;
HandlebarsTemplateService.prototype.compilerOptions = null;

HandlebarsTemplateService.prototype.compile = function(templateSource) {
	var helpers = this.helpers;
	var compilerOptions = this.compilerOptions;

	// Create a new compiler instance and load it with the correct helpers
	var compiler = Handlebars.create();
	Object.keys(helpers).forEach(function(helperName) {
		var helper = helpers[helperName];
		compiler.registerHelper(helperName, helper);
	});

	// Compile the template into a standard 2-arg Handlebars template function
	var templateFunction = compiler.compile(templateSource, compilerOptions);

	// Convert the 2-arg template function into a 1-arg render function
	var renderFunction = function(context) {
		// Extract the Handlebars render options from the
		// magic `_` property within the context hash
		var templateOptions = context._ || {};

		// Render the template
		var output = templateFunction(context, templateOptions);

		return output;
	};

	// Return the 1-arg render function
	return renderFunction;
};

HandlebarsTemplateService.prototype.precompile = function(templateSource) {
	var compilerOptions = this.compilerOptions;
	return Handlebars.precompile(templateSource, compilerOptions);
};

module.exports = HandlebarsTemplateService;
