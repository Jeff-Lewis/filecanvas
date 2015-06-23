'use strict';

var TemplateService = require('../services/TemplateService');

var templateService = new TemplateService();

module.exports = {
	'fathom': {
		login: templateService.compile('templates/sites/fathom/login.hbs'),
		index: templateService.compile('templates/sites/fathom/index.hbs')
	}
};
