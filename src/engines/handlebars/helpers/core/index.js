'use strict';

var Handlebars = require('handlebars');

module.exports = Handlebars.Utils.extend({},
	require('./date'),
	require('./logic'),
	require('./serialization'),
	require('./string'),
	require('./types')
);
