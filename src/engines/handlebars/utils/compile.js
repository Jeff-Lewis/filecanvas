'use strict';

var memoize = require('lodash.memoize');

var constants = require('../../../constants');

var helpers = require('../helpers');

var HandlebarsTemplateService = require('../../../services/HandlebarsTemplateService');

var HANDLEBARS_COMPILER_OPTIONS = constants.HANDLEBARS_COMPILER_OPTIONS;

var handlebarsTemplateService = new HandlebarsTemplateService({
	helpers: helpers,
	compiler: HANDLEBARS_COMPILER_OPTIONS
});

module.exports = memoize(function(templatePath) {
	return handlebarsTemplateService.compile(templatePath);
});
