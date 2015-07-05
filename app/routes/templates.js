'use strict';

var path = require('path');
var express = require('express');

var templatesRoot = path.resolve(path.dirname(require.main.filename), 'templates/sites/themes');

var app = express.static(templatesRoot);

module.exports = app;
