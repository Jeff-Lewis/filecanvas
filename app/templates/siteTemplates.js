module.exports = (function() {
	'use strict';

	var TemplateService = require('../services/TemplateService');

	var templateService = new TemplateService();

	return {
		'fathom': templateService.compile('templates/sites/fathom/index.hbs')
	};
})();
