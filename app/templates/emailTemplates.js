module.exports = (function() {
	'use strict';

	var TemplateService = require('../services/TemplateService');

	var templateService = new TemplateService();

	return {
		'HELLO_WORLD': templateService.compile('templates/emails/hello-world.hbs')
	};
})();
