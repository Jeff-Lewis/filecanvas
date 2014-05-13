module.exports = (function() {
	'use strict';

	var fs = require('fs');
	var path = require('path');
	var Handlebars = require('handlebars');

	Handlebars.registerHelper('ifequals', function(item1, item2, options) {
		var isEqual = (item1 == item2); // jshint ignore:line
		if (isEqual) {
			return options.fn(this);
		} else {
			return options.inverse(this);
		}
	});

	Handlebars.registerHelper('unlessequals', function(item1, item2, options) {
		var isNotEqual = (item1 != item2); // jshint ignore:line
		if (isNotEqual) {
			return options.fn(this);
		} else {
			return options.inverse(this);
		}
	});

	Handlebars.registerHelper('replace', function(item1, item2, options) {
		return options.fn(this).replace(item1, item2);
	});

	Handlebars.registerHelper('timestamp', function(date, options) {
		return Math.floor(date.getTime() / 1000);
	});

	function TemplateService() {

	}

	TemplateService.prototype.compile = function(templatePath) {
		var filePath = path.resolve(path.dirname(require.main.filename), templatePath);
		var template = fs.readFileSync(filePath, 'UTF-8');
		return Handlebars.compile(template);
	};

	return TemplateService;
})();
