'use strict';

module.exports = {
	entry: './filecanvas-editor.js',
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
