'use strict';

var constants = require('../../constants');

var helpers = require('./helpers');

var HtmlbarsService = require('./HtmlbarsService');
var HandlebarsEngineFactory = require('../handlebars/HandlebarsEngineFactory');

var COMPILER_OPTIONS = constants.HTMLBARS_COMPILER_OPTIONS;
var DEFAULT_TEMPLATE_OPTIONS = constants.HTMLBARS_DEFAULT_TEMPLATE_OPTIONS;
var SERIALIZED_TEMPLATES_NAMESPACE = constants.HTMLBARS_SERIALIZED_TEMPLATES_NAMESPACE;
var SERIALIZED_PARTIALS_NAMESPACE = constants.HTMLBARS_SERIALIZED_PARTIALS_NAMESPACE;

var htmlbarsService = new HtmlbarsService({
	helpers: helpers,
	compiler: COMPILER_OPTIONS
});

var engineFactory = new HandlebarsEngineFactory(htmlbarsService, {
	templatesNamespace: SERIALIZED_TEMPLATES_NAMESPACE,
	partialsNamespace: SERIALIZED_PARTIALS_NAMESPACE,
	templateOptions: DEFAULT_TEMPLATE_OPTIONS,
	transform: function(output) {
		// HTMLBars doesn't parse doctype nodes, so we need to prepend one
		return addHtml5Doctype(output);


		function addHtml5Doctype(html) {
			var doctype = '<!DOCTYPE html>';
			html = doctype + '\n' + html;
			return html;
		}
	}
});

var engine = engineFactory.getInstance();

module.exports = engine;
