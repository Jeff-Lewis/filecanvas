module.exports = (function() {
	'use strict';

	var fs = require('fs');
	var path = require('path');
	var Handlebars = require('handlebars');

	function TemplateService() {

	}

	TemplateService.prototype.compile = function(templatePath) {
		var filePath = path.resolve(path.dirname(require.main.filename), templatePath);
		var template = fs.readFileSync(filePath, 'UTF-8');
		return Handlebars.compile(template);
	};

	return TemplateService;
})();
