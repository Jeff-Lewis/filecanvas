'use strict';

var fs = require('fs');
var Handlebars = require('handlebars');

var templateCache = {};

module.exports = function(filePath, options, callback) {
	var context = options;
	loadTemplate(filePath, context)
		.then(function(templateFunction) {
			var templateOptions = options._ || {};
			var output = templateFunction(context, templateOptions);
			callback(null, output);
		})
		.catch(function(error) {
			return callback(error);
		});
};

function loadTemplate(templatePath, context) {
	var hasCachedTemplate = getHasCachedTemplate(templatePath, templateCache);
	if (hasCachedTemplate) {
		var cachedTemplate = retrieveCachedTemplate(templatePath, templateCache);
		return Promise.resolve(cachedTemplate);
	} else {
		return loadTemplate(templatePath, context)
			.then(function(templateFunction) {
				cacheTemplate(templateFunction, templatePath, templateCache);
				return templateFunction;
			});
	}


	function loadTemplate(templatePath, callback) {
		return new Promise(function(resolve, reject) {
			var compiler = createHandlebarsCompiler();
			fs.readFile(templatePath, { encoding: 'utf-8' }, function(error, templateSource) {
				if (error) { return reject(error); }
				var templateFunction = compiler.compile(templateSource);
				resolve(templateFunction);
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

function createHandlebarsCompiler() {
	var compiler = Handlebars.create();
	registerHelpers(compiler);
	return compiler;


	function registerHelpers(compiler) {
		registerBooleanHelpers(compiler);
		registerArrayHelpers(compiler);
		registerStringHelpers(compiler);


		function registerBooleanHelpers(compiler) {
			compiler.registerHelper('eq', function(item1, item2, options) {
				return item1 === item2;
			});
			compiler.registerHelper('not-eq', function(item1, item2, options) {
				return item1 !== item2;
			});
			compiler.registerHelper('not', function(item, options) {
				return !item;
			});
			compiler.registerHelper('and', function(item1, item2, options) {
				return item1 && item2;
			});
			compiler.registerHelper('or', function(item1, item2, options) {
				return item1 || item2;
			});
			compiler.registerHelper('gt', function(item1, item2, options) {
				return item1 > item2;
			});
			compiler.registerHelper('gte', function(item1, item2, options) {
				return item1 >= item2;
			});
			compiler.registerHelper('lt', function(item1, item2, options) {
				return item1 >= item2;
			});
			compiler.registerHelper('lte', function(item1, item2, options) {
				return item1 >= item2;
			});
		}

		function registerArrayHelpers(compiler) {
			compiler.registerHelper('is-array', function(item, options) {
				return Array.isArray(item);
			});
		}

		function registerStringHelpers(compiler) {
			compiler.registerHelper('replace', function(item1, item2, options) {
				return options.fn(this).replace(item1, item2);
			});
			compiler.registerHelper('concat', function(item, options) {
				var items = Array.prototype.slice.call(arguments, 0, -1);
				return items.join('');
			});
			compiler.registerHelper('startsWith', function(haystack, needle, options) {
				return haystack.indexOf(needle) === 0;
			});
		}
	}
}
