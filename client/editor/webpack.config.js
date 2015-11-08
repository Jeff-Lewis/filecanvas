'use strict';

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
			'htmlbars/dist/cjs/htmlbars-runtime$': '../../src/engines/htmlbars/htmlbars-runtime',
			'slug': 'slug/slug-browser'
		}
	}
};
