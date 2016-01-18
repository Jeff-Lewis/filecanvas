'use strict';

var Handlebars = require('handlebars');

module.exports['css'] = function(value, option) {
	var escapedCss = escapeCss(value);
	return new Handlebars.SafeString(escapedCss);

	function escapeCss(css) {
		if (!css) { return ''; }
		return css.replace(/</g, '&lt;');
	}
};
