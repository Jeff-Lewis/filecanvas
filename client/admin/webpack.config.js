'use strict';

module.exports = {
	entry: './admin.js',
	output: {
		filename: '../../templates/admin/assets/js/shunt-admin.js'
	},
	resolve: {
		alias: {
			'slug': 'slug/slug-browser'
		}
	}
};
