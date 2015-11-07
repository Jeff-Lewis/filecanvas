'use strict';

var fs = require('fs');
var merge = require('lodash.merge');
var Handlebars = require('handlebars');

function HandlebarsTemplateService(options) {
	options = options || {};
	this.helpers = options.helpers || {};
	this.compilerOptions = merge({ knownHelpers: this.helpers }, options.compiler || {});
}

HandlebarsTemplateService.prototype.helpers = null;
HandlebarsTemplateService.prototype.compilerOptions = null;

HandlebarsTemplateService.prototype.compile = function(templatePath) {
	var helpers = this.helpers;
	var compilerOptions = this.compilerOptions;
	return loadFile(templatePath)
		.then(function(templateSource) {
			return compileTemplate(templateSource, helpers, compilerOptions);
		});


	function compileTemplate(templateSource, helpers, compilerOptions) {
		// Create a new compiler instance and load it with the correct helpers
		var compiler = Handlebars.create();
		Object.keys(helpers).forEach(function(helperName) {
			var helper = helpers[helperName];
			compiler.registerHelper(helperName, helper);
		});

		// Compile the template into a standard 2-arg Handlebars template function
		var templateFunction = compiler.compile(templateSource, compilerOptions);

		// Return the Handlebars template function
		return templateFunction;
	}
};

HandlebarsTemplateService.prototype.render = function(templatePath, context) {
	return this.compile(templatePath)
		.then(function(templateFunction) {
			// Extract the Handlebars render options from the
			// magic `_` property within the context hash
			var templateOptions = context._ || {};

			// Render the Handlebars template
			var output = templateFunction(context, templateOptions);

			return output;
		});
};

HandlebarsTemplateService.prototype.serialize = function(templatePath) {
	var compilerOptions = this.compilerOptions;
	return loadFile(templatePath)
		.then(function(templateSource) {
			return Handlebars.precompile(templateSource, compilerOptions);
		});
};

module.exports = HandlebarsTemplateService;


function loadFile(filePath) {
	return new Promise(function(resolve, reject) {
		fs.readFile(filePath, { encoding: 'utf-8' }, function(error, data) {
			if (error) { return reject(error); }
			resolve(data);
		});
	});
}
