module.exports = (function() {
	'use strict';

	var path = require('path');
	var express = require('express');

	var templatesRoot = path.resolve(path.dirname(require.main.filename), 'templates/sites');

	return express['static'](templatesRoot);
})();
