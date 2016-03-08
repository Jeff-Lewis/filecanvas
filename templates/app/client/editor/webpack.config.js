'use strict';

module.exports = {
	entry: './editor.js',
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
