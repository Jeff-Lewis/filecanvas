'use strict';

var fs = require('fs');
var path = require('path');
var Handlebars = require('handlebars');
var showdown = require('showdown');
var slug = require('slug');
var bytes = require('bytes');

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
		registerDateHelpers(compiler);
		registerSerializerHelpers(compiler);
		registerSiteHelpers(compiler, config);
		registerFileHelpers(compiler);


		function registerBooleanHelpers(compiler) {
			compiler.registerHelper('eq', function(item1, item2, options) {
				return item1 === item2;
			});
			compiler.registerHelper('not-eq', function(item1, item2, options) {
				var items = Array.prototype.slice.call(arguments, 1, -1);
				return items.every(function(item) { return item1 !== item; });
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
			compiler.registerHelper('is-array', function(value, options) {
				return Array.isArray(value);
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
			compiler.registerHelper('slug', function(value, options) {
				return slug(value, { lower: true });
			});
		}

		function registerDateHelpers(compiler) {
			compiler.registerHelper('timestamp', function(value, options) {
				return (value ? Math.floor(value.getTime() / 1000) : null);
			});
			compiler.registerHelper('date', function(value, options) {
				var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
				var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dev'];
				return DAYS[value.getDay()] + ' ' + value.getDate() + ' ' + MONTHS[value.getMonth()] + ' ' + value.getFullYear();
			});
		}

		function registerSerializerHelpers(compiler) {
			compiler.registerHelper('json', function(value, options) {
				return JSON.stringify(value);
			});
			compiler.registerHelper('markdown', function(value, options) {
				var safeValue = Handlebars.Utils.escapeExpression(value);
				safeValue = restoreBlockQuotes(safeValue);
				var converter = new showdown.Converter();
				var html = converter.makeHtml(safeValue);
				return new Handlebars.SafeString(html);


				function restoreBlockQuotes(escapedValue) {
					return escapedValue.replace(/^&gt;/gm, '>');
				}
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
				return config.context.siteRoot + 'download' + file.path;
			});
			compiler.registerHelper('thumbnailUrl', function(file) {
				return config.context.siteRoot + 'thumbnail' + file.path;
			});
		}

		function registerFileHelpers(compiler) {
			compiler.registerHelper('label', function(value, options) {
				var label = path.basename(value.path, path.extname(value.path));
				return stripLeadingNumber(label);


				function stripLeadingNumber(string) {
					return string.replace(/^[0-9]+[ \.\-\|]*/, '');
				}
			});
			compiler.registerHelper('basename', function(value, options) {
				return path.basename(value.path);
			});
			compiler.registerHelper('extension', function(value, options) {
				return path.extname(value.path).replace(/^\./, '');
			});
			compiler.registerHelper('filesize', function(value, options) {
				return bytes.format(value.size, { precision: 1 });
			});
			compiler.registerHelper('files', function(value, options) {
				if (!value.contents) { return null; }
				return value.contents.filter(function(file) {
					return !file.directory;
				}).sort(function(file1, file2) {
					return sortByPrefixedFilename(file1, file2) || sortByLastModified(file1, file2);
				});
			});
			compiler.registerHelper('folders', function(value, options) {
				if (!value.contents) { return null; }
				return value.contents.filter(function(file) {
					return file.directory;
				}).sort(function(file1, file2) {
					return sortByPrefixedFilename(file1, file2) || sortByFilename(file1, file2);
				});
			});


			function sortByPrefixedFilename(file1, file2) {
				var file1Filename = path.basename(file1.path);
				var file2Filename = path.basename(file2.path);
				var file1Prefix = parseInt(file1Filename);
				var file2Prefix = parseInt(file2Filename);
				var file1HasPrefix = !isNaN(file1Prefix);
				var file2HasPrefix = !isNaN(file2Prefix);
				if (!file1HasPrefix && !file2HasPrefix) { return 0; }
				if (file1HasPrefix && !file2HasPrefix) { return -1; }
				if (file2HasPrefix && !file1HasPrefix) { return 1; }
				if (file1Prefix === file2Prefix) {
					return sortByFilename(file1, file2);
				}
				return file1Prefix - file2Prefix;
			}

			function sortByFilename(file1, file2) {
				var file1Filename = path.basename(file1.path);
				var file2Filename = path.basename(file2.path);
				return (file1Filename.toLowerCase() < file2Filename.toLowerCase() ? -1 : 1);
			}

			function sortByLastModified(file1, file2) {
				var file1Date = file1.modified;
				var file2Date = file2.modified;
				return file2Date.getTime() - file1Date.getTime();
			}
		}
	}
}
