'use strict';

var objectAssign = require('object-assign');

var emberHelpers = require('@timkendrick/ember-htmlbars-helpers');
var handlebarsHelpers = require('../../handlebars/helpers');

module.exports = objectAssign(emberHelpers, handlebarsHelpers);
