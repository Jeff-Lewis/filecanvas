module.exports = (function() {
	'use strict';

	var TemplateService = require('../services/TemplateService');

	var templateService = new TemplateService();

	return {
		'fathom': {
			login: templateService.compile('templates/sites/fathom/login.hbs'),
			index: templateService.compile('templates/sites/fathom/index.hbs')
		}
	};
})();
