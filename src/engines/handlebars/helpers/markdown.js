'use strict';

var Handlebars = require('handlebars');
var showdown = require('showdown');

module.exports['markdown'] = function(value, options) {
	var safeValue = Handlebars.Utils.escapeExpression(value);
	safeValue = restoreBlockQuotes(safeValue);
	var converter = new showdown.Converter();
	var html = converter.makeHtml(safeValue);
	return new Handlebars.SafeString(html);


	function restoreBlockQuotes(escapedValue) {
		return escapedValue.replace(/^&gt;/gm, '>');
	}
};
