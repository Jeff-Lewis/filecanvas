'use strict';

var objectAssign = require('object-assign');

var resolveChildPath = require('./resolveChildPath');
var resolvePartials = require('./resolvePartials');

module.exports = function(theme, themePath) {
	return objectAssign({}, theme, {
		templates: Object.keys(theme.templates).reduce(function(templates, templateId) {
			var template = theme.templates[templateId];
			var templatePath = resolveChildPath(themePath, template.filename);
			var partialsRoot = (template.options && template.options.partials ? resolveChildPath(themePath, template.options.partials) : null);
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
