'use strict';

var fs = require('fs');
var Handlebars = require('handlebars');
var showdown = require('showdown');

var templateCache = {};
var compilerConfig = {};

module.exports = function(filePath, options, callback) {
	loadTemplate(filePath)
		.then(function(templateFunction) {
			var context = options;
			var templateOptions = options._ || {};
			compilerConfig.context = context;
			var output = templateFunction(context, templateOptions);
			callback(null, output);
		})
		.catch(function(error) {
			return callback(error);
		});
};

function loadTemplate(templatePath) {
	var hasCachedTemplate = getHasCachedTemplate(templatePath, templateCache);
	if (hasCachedTemplate) {
		var cachedTemplate = retrieveCachedTemplate(templatePath, templateCache);
		return Promise.resolve(cachedTemplate);
	} else {
		return loadTemplate(templatePath)
			.then(function(templateFunction) {
				cacheTemplate(templateFunction, templatePath, templateCache);
				return templateFunction;
			});
	}


	function loadTemplate(templatePath) {
		return new Promise(function(resolve, reject) {
			var compiler = createHandlebarsCompiler(compilerConfig);
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

function createHandlebarsCompiler(config) {
	var compiler = Handlebars.create();
	registerHelpers(compiler, config);
	return compiler;


	function registerHelpers(compiler, config) {
		registerBooleanHelpers(compiler);
		registerArrayHelpers(compiler);
		registerStringHelpers(compiler);
		registerSerializerHelpers(compiler);
		registerSiteHelpers(compiler, config);


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
				var items = Array.prototype.slice.call(arguments, 0, -1);
				return items.every(function(item) { return Array.isArray(item) ? item.length > 0 : Boolean(item); });
			});
			compiler.registerHelper('or', function(item1, item2, options) {
				var items = Array.prototype.slice.call(arguments, 0, -1);
				return items.some(function(item) { return Array.isArray(item) ? item.length > 0 : Boolean(item); });
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
			compiler.registerHelper('concat', function(item1, options) {
				var items = Array.prototype.slice.call(arguments, 0, -1);
				return items.join('');
			});
			compiler.registerHelper('startsWith', function(haystack, needle, options) {
				return haystack.indexOf(needle) === 0;
			});
			compiler.registerHelper('escapeNewlines', function(value, options) {
				var safeValue = Handlebars.Utils.escapeExpression(value);
				var escapedValue = safeValue.replace(/\n/g, '&#10;').replace(/\r/g, '&#13;');
				return new Handlebars.SafeString(escapedValue);
			});
		}

		function registerSerializerHelpers(compiler) {
			compiler.registerHelper('json', function(value, options) {
				return JSON.stringify(value);
			});
			compiler.registerHelper('markdown', function(value, options) {
				var safeValue = Handlebars.Utils.escapeExpression(value);
				var converter = new showdown.Converter();
				var html = converter.makeHtml(safeValue);
				return new Handlebars.SafeString(html);
			});
		}

		function registerSiteHelpers(compiler, config) {
			compiler.registerHelper('loginUrl', function() {
				return config.context.siteRoot + 'login';
			});
			compiler.registerHelper('logoutUrl', function() {
				return config.context.siteRoot + 'logout';
			});
			compiler.registerHelper('resourceUrl', function(filePath) {
				return config.context.themeRoot + filePath;
			});
			compiler.registerHelper('downloadUrl', function(file) {
				return config.context.siteRoot + 'download' + file.url;
			});
			compiler.registerHelper('thumbnailUrl', function(file) {
				return config.context.siteRoot + 'thumbnail' + file.url;
			});
		}
	}
}
