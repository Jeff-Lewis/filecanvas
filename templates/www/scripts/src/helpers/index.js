'use strict';

var Handlebars = require('handlebars');
var coreHelpers = require('@timkendrick/handlebars-core-helpers');
var markdownHelpers = require('../../../../../src/engines/handlebars/helpers/media/markdown');

module.exports = Handlebars.Utils.extend({},
	coreHelpers,
	markdownHelpers,
	require('./url')
);
