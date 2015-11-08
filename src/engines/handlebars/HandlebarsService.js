'use strict';

var fs = require('fs');
var merge = require('lodash.merge');
var Handlebars = require('handlebars');

function HandlebarsService(options) {
	options = options || {};
	this.helpers = options.helpers || {};
	this.compilerOptions = merge({ knownHelpers: this.helpers }, options.compiler || {});
}

HandlebarsService.prototype.helpers = null;
HandlebarsService.prototype.compilerOptions = null;

HandlebarsService.prototype.compile = function(templatePath) {
	var helpers = this.helpers;
	var compilerOptions = this.compilerOptions;
	return loadFile(templatePath)
		.then(function(templateSource) {
			return compileTemplate(templateSource, helpers, compilerOptions);
		});


	function compileTemplate(templateSource, helpers, compilerOptions) {
		var compiler = Handlebars.create();
		compiler.registerHelper(helpers);
		var templateFunction = compiler.compile(templateSource, compilerOptions);
		return templateFunction;
	}
};

HandlebarsService.prototype.render = function(template, context, templateOptions) {
	var output = template(context, templateOptions);
	return output;
};

HandlebarsService.prototype.serialize = function(templatePath) {
	var compilerOptions = this.compilerOptions;
	return loadFile(templatePath)
		.then(function(templateSource) {
			return Handlebars.precompile(templateSource, compilerOptions);
		});
};

module.exports = HandlebarsService;


function loadFile(filePath) {
	return new Promise(function(resolve, reject) {
		fs.readFile(filePath, { encoding: 'utf-8' }, function(error, data) {
			if (error) { return reject(error); }
			resolve(data);
		});
	});
}
