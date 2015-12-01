'use strict';

module.exports = {
	entry: './editor.js',
	output: {
		filename: '../../templates/admin/assets/js/filecanvas-editor.js'
	},
	module: {
		loaders: [
			{ test: /\.json$/, loader: 'json' }
		]
	},
	resolve: {
		alias: {
			'handlebars': 'handlebars/runtime',
			'slug': 'slug/slug-browser'
		}
	}
};
