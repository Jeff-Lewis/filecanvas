module.exports = (function() {
	'use strict';

	var express = require('express');
	var path = require('path');

	var templatesRoot = path.resolve(path.dirname(require.main.filename), 'templates');

	return express.static(templatesRoot);
})();