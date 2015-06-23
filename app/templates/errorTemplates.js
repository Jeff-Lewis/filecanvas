'use strict';

var TemplateService = require('../services/TemplateService');

var templateService = new TemplateService();

module.exports = {
	error: templateService.compile('templates/error/error.hbs')
};
