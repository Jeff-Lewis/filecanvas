module.exports = (function() {
	'use strict';

	var fs = require('fs');
	var path = require('path');
	var Handlebars = require('handlebars');

	return {
		'fathom': compileTemplate('templates/fathom/index.hbs')
	};


	function compileTemplate(templatePath) {
		var filePath = path.resolve(path.dirname(require.main.filename), templatePath);
		var template = fs.readFileSync(filePath, 'UTF-8');
		return Handlebars.compile(template);
	}
})();
