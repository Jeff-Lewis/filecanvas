'use strict';

var fs = require('fs');

function TemplateService() {
	this.cache = {};
}

TemplateService.prototype.cache = null;

TemplateService.prototype.compile = function(templateSource) {
	return function render(options) {
		return templateSource;
	};
};

TemplateService.prototype.render = function(template, options) {
	var compile = this.compile.bind(this);
	var templateCache = this.cache;
	return loadTemplate(template, templateCache, compile)
		.then(function(templateFunction) {
			return templateFunction(options);
		});


		function loadTemplate(templatePath, templateCache, compile) {
			var hasCachedTemplate = getHasCachedTemplate(templatePath, templateCache);
			if (hasCachedTemplate) {
				var cachedTemplate = retrieveCachedTemplate(templatePath, templateCache);
				return Promise.resolve(cachedTemplate);
			} else {
				return readFile(templatePath)
					.then(function(templateSource) {
						return compile(templateSource);
					})
					.then(function(templateFunction) {
						cacheTemplate(templateFunction, templatePath, templateCache);
						return templateFunction;
					});
			}


			function readFile(filePath) {
				return new Promise(function(resolve, reject) {
					fs.readFile(filePath, { encoding: 'utf-8' }, function(error, data) {
						if (error) { return reject(error); }
						resolve(data);
					});
				});
			}

			function getHasCachedTemplate(templatePath, templateCache) {
				return (templatePath in templateCache);
			}

			function cacheTemplate(templateFunction, templatePath, templateCache) {
				templateCache[templatePath] = templateFunction;
			}

			function retrieveCachedTemplate(templatePath, templateCache) {
				return templateCache[templatePath];
			}
		}
};

module.exports = TemplateService;
