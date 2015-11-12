'use strict';

var path = require('path');

module.exports = {
	entry: './editor.js',
	output: {
		filename: '../../templates/admin/assets/js/shunt-editor.js'
	},
	module: {
		loaders: [
			{ test: /\.json$/, loader: 'json' }
		]
	},
	resolve: {
		alias: {
			'handlebars': 'handlebars/runtime',
			'htmlbars/dist/cjs/htmlbars-runtime$': path.resolve(__dirname, '../../src/engines/htmlbars/htmlbars-runtime'),
			'slug': 'slug/slug-browser'
		}
	}
};
