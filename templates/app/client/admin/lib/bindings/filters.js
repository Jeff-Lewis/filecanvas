'use strict';

var slug = require('slug');

module.exports = {
	'slug': function(value) {
		return slug(value, { lower: true });
	},
	'format': function(value, formatString, emptyString) {
		if (!value && (arguments.length >= 3)) { return emptyString; }
		return formatString.replace(/\$0/g, value);
	},
	'filename': function(value) {
		// See https://www.dropbox.com/en/help/145
		return value.replace(/[\/<>:"|?*]/g, '');
	}
};
