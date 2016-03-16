'use strict';

module.exports = {
	'slug': function(value) {
		return value.toLowerCase().replace(/['"‘’“”]/g, '').replace(/[^a-z0-9]+/g, '-');
	}
};
