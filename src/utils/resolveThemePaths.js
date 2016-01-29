'use strict';

var path = require('path');
var objectAssign = require('object-assign');

var resolvePartials = require('./resolvePartials');

module.exports = function(theme, themePath) {
	return objectAssign({}, theme, {
		templates: Object.keys(theme.templates).reduce(function(templates, templateId) {
			var template = theme.templates[templateId];
			var templatePath = path.resolve(themePath, template.filename);
			var partialsRoot = (template.options && template.options.partials ? path.resolve(themePath, template.options.partials) : null);
			var resolvedPartials = (partialsRoot ? resolvePartials(partialsRoot) : null);
			var resolvedOptions = (resolvedPartials ? objectAssign({}, template.options, { partials: resolvedPartials }) : template.options);
			var resolvedTemplate = objectAssign({}, template, {
				path: templatePath,
				options: resolvedOptions
			});
			templates[templateId] = resolvedTemplate;
			return templates;
		}, {})
	});
};
