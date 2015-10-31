'use strict';

var fileCacheService = require('./fileCacheService');
var helpers = require('../engines/handlebars/helpers');
var HandlebarsTemplateService = require('../services/HandlebarsTemplateService');

module.exports = new HandlebarsTemplateService({
	fileCache: fileCacheService,
	helpers: helpers,
	compiler: {
		knownHelpersOnly: true,
		knownHelpers: helpers
	}
});
