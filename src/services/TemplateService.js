'use strict';

var escapeString = require('js-string-escape');

var FileCacheService = require('./FileCacheService.js');
var AsyncCacheService = require('./AsyncCacheService.js');

function TemplateService(options) {
	options = options || {};
	var fileCache = options.fileCache || new FileCacheService();
	var self = this;
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

TemplateService.prototype.render = function(templatePath, context) {
	return this.compiledTemplateCache.get(templatePath)
		.then(function(compiledFunction) {
			return compiledFunction(context);
		});
};

TemplateService.prototype.serialize = function(templatePath, options) {
	options = options || {};
	if (!options.name) {
		return Promise.reject(new Error('No template name specified'));
	}
	return this.precompiledTemplateCache.get(templatePath)
		.then(function(precompiledFunction) {
			return options.name + '=' + precompiledFunction + ';';
		});
};

module.exports = TemplateService;
