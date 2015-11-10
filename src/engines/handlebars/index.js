'use strict';

var constants = require('../../constants');

var helpers = require('./helpers');

var HandlebarsService = require('./HandlebarsService');
var HandlebarsEngineFactory = require('./HandlebarsEngineFactory');

var COMPILER_OPTIONS = constants.HANDLEBARS_COMPILER_OPTIONS;
var DEFAULT_TEMPLATE_OPTIONS = constants.HANDLEBARS_DEFAULT_TEMPLATE_OPTIONS;
var SERIALIZED_TEMPLATES_NAMESPACE = constants.HANDLEBARS_SERIALIZED_TEMPLATES_NAMESPACE;
var SERIALIZED_PARTIALS_NAMESPACE = constants.HANDLEBARS_SERIALIZED_PARTIALS_NAMESPACE;

var handlebarsService = new HandlebarsService({
	helpers: helpers,
	compiler: COMPILER_OPTIONS,
	defaultTemplateOptions: DEFAULT_TEMPLATE_OPTIONS
});

var engineFactory = new HandlebarsEngineFactory(handlebarsService, {
	templatesNamespace: SERIALIZED_TEMPLATES_NAMESPACE,
	partialsNamespace: SERIALIZED_PARTIALS_NAMESPACE,
	templateOptions: DEFAULT_TEMPLATE_OPTIONS
});

var engine = engineFactory.getInstance();

module.exports = engine;
