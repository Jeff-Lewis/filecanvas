'use strict';

var fs = require('fs');
var Handlebars = require('handlebars');

var templateCache = {};

Handlebars.registerHelper('ifequals', function(item1, item2, options) {
	var isEqual = (item1 == item2); // eslint-disable-line eqeqeq
	if (isEqual) {
		return options.fn(this);
	} else {
		return options.inverse(this);
	}
});

Handlebars.registerHelper('unlessequals', function(item1, item2, options) {
	var isNotEqual = (item1 != item2); // eslint-disable-line eqeqeq
	if (isNotEqual) {
		return options.fn(this);
	} else {
		return options.inverse(this);
	}
});

Handlebars.registerHelper('replace', function(item1, item2, options) {
	return options.fn(this).replace(item1, item2);
});

module.exports = function(filePath, options, callback) {
	loadTemplate(filePath, function(error, template) {
		if (error) { return callback(error); }
		var context = options;
		var templateOptions = options._ || {};
		var output = template(context, templateOptions);
		callback(null, output);
	});
};

function loadTemplate(templatePath, callback) {
	if (templatePath in templateCache) {
		loadCachedTemplate(templatePath, templateCache, callback);
	} else {
		loadTemplate(templatePath, function(error, templateFunction) {
			templateCache[templatePath] = templateFunction;
			callback(null, templateFunction);
		});
	}


	function loadTemplate(templatePath, callback) {
		fs.readFile(templatePath, { encoding: 'utf-8' }, function(error, data) {
			if (error) { return callback(error); }
			var templateFunction = Handlebars.compile(data);
			callback(null, templateFunction);
		});
	}

	function loadCachedTemplate(templatePath, templateCache, callback) {
		process.nextTick(function() {
			var templateFunction = templateCache[templatePath];
			callback(null, templateFunction);
		});
	}
}
