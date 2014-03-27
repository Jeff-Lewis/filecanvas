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

	function TemplateService() {

	}

	TemplateService.prototype.compile = function(templatePath) {
		var filePath = path.resolve(path.dirname(require.main.filename), templatePath);
		var template = fs.readFileSync(filePath, 'UTF-8');
		return Handlebars.compile(template);
	};

	return TemplateService;
})();