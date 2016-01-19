'use strict';

var Handlebars = require('handlebars');
var coreHelpers = require('@timkendrick/handlebars-core-helpers');

module.exports = Handlebars.Utils.extend({},
	coreHelpers,
	require('./url')
);
