'use strict';

var escapeString = require('js-string-escape');

var FileCacheService = require('./FileCacheService.js');
var AsyncCacheService = require('./AsyncCacheService.js');

function TemplateService() {
	var self = this;
	var fileCache = new FileCacheService();
	this.compiledTemplateCache = new AsyncCacheService(function(templatePath) {
		return fileCache.get(templatePath)
			.then(function(templateSource) {
				return self.compile(templateSource);
			});
	});
	this.precompiledTemplateCache = new AsyncCacheService(function(templatePath) {
		return fileCache.get(templatePath)
			.then(function(templateSource) {
				return self.precompile(templateSource);
			});
	});
}

TemplateService.prototype.compiledTemplateCache = null;
TemplateService.prototype.precompiledTemplateCache = null;

TemplateService.prototype.compile = function(templateSource) {
	return function render(context) {
		return templateSource;
	};
};

TemplateService.prototype.precompile = function(templateSource) {
	return 'function(context){return"' + escapeString(templateSource) + '";}';
};

TemplateService.prototype.render = function(templatePath, options) {
	return this.compiledTemplateCache.get(templatePath)
		.then(function(compiledFunction) {
			return compiledFunction(options);
		});
};

TemplateService.prototype.serialize = function(templatePath, options) {
	return this.precompiledTemplateCache.get(templatePath)
		.then(function(precompiledFunction) {
			return options.name + '=' + precompiledFunction + ';';
		});
};

module.exports = TemplateService;
