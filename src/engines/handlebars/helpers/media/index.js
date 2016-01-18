'use strict';

var Handlebars = require('handlebars');

module.exports = Handlebars.Utils.extend({},
	require('./css'),
	require('./markdown'),
	require('./url')
);
