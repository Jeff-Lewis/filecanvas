'use strict';

var merge = require('lodash.merge');
var memoize = require('lodash.memoize');

var helpers = require('./helpers');
var hooks = require('./hooks');

var HtmlbarsService = require('./HtmlbarsService');

var templatesNamespace = 'Htmlbars.templates';
var partialsNamespace = 'Htmlbars.partials';
var defaultTemplateOptions = {
	helpers: undefined,
	partials: undefined,
	data: undefined
};

var templateService = new HtmlbarsService({
	helpers: helpers,
	hooks: hooks,
	compiler: {}
});

function engine(templatePath, context, callback) {
	// Extract the HTMLBars render options from the
	// magic `_` property within the context hash
	var templateOptions = context._ || {};

	// Render the HTMLBars template
	return engine.render(templatePath, context, templateOptions)
		.then(function(output) {
			callback(null, output);
		})
		.catch(function(error) {
			callback(error);
		});
}

engine.render = function(templatePath, context, templateOptions) {
	return compileTemplateBundle(templatePath, templateOptions)
		.then(function(render) {
			return render(context);
		})
		.then(function(output) {
			// HTMLBars doesn't parse doctype nodes, so we need to prepend one
			return addHtml5Doctype(output);


			function addHtml5Doctype(html) {
				var doctype = '<!DOCTYPE html>';
				html = doctype + '\n' + html;
				return html;
			}
		});
};

engine.serialize = function(templatePath, templateName, templateOptions) {
	return serializeTemplateBundle(templatePath, templateName, templateOptions);
};

var compile = memoize(function(templatePath) {
	return templateService.compile(templatePath);
});

var precompile = memoize(function(templatePath) {
	return templateService.serialize(templatePath);
});

var compileTemplate = memoize(function(templatePath) {
	return compile(templatePath);
});

var compilePartial = memoize(function(templatePath) {
	return compile(templatePath);
});

var serializeTemplate = memoize(function(templatePath, templateName) {
	return precompile(templatePath)
		.then(function(precompiledTemplate) {
			return wrapHtmlbarsTemplate(precompiledTemplate, {
				namespace: templatesNamespace,
				name: templateName
			});
		});
}, function(templatePath, templateName) { return templatePath + ':' + templateName; });

var serializePartial = memoize(function(partialPath, partialName) {
	return precompile(partialPath)
		.then(function(precompiledPartial) {
			return wrapHtmlbarsTemplate(precompiledPartial, {
				namespace: partialsNamespace,
				name: partialName
			});
		});
}, function(partialPath, partialName) { return partialPath + ':' + partialName; });

function compileTemplateBundle(templatePath, templateOptions) {
	templateOptions = merge({}, defaultTemplateOptions, templateOptions);
	var partials = templateOptions.partials;
	return Promise.all([
		compileTemplate(templatePath),
		compilePartials(partials)
	])
		.then(function(values) {
			var compiledTemplate = values[0];
			var compiledPartials = values[1];
			var renderOptions = merge({}, templateOptions, { partials: compiledPartials });
			return function(context) {
				var output = templateService.render(compiledTemplate, context, renderOptions);
				return Promise.resolve(output);
			};
		});


		function compilePartials(partials) {
			if (!partials) { return Promise.resolve({}); }
			var partialIds = Object.keys(partials);
			var partialPaths = partialIds.map(
				function(partialId) { return partials[partialId]; }
			);
			return Promise.all(
				partialPaths.map(function(partialPath) {
					return compilePartial(partialPath);
				})
			).then(function(compiledPartials) {
				return compiledPartials.reduce(function(compiledPartialsHash, compiledPartial, index) {
					var partialId = partialIds[index];
					compiledPartialsHash[partialId] = compiledPartial;
					return compiledPartialsHash;
				}, {});
			});
		}
}

function serializeTemplateBundle(templatePath, templateName, templateOptions) {
	templateOptions = merge({}, defaultTemplateOptions, templateOptions);
	var partials = templateOptions.partials;
	return Promise.all([
		serializeTemplate(templatePath, templateName),
		serializePartials(partials, templateName)
	])
		.then(function(values) {
			var serializedTemplate = values[0];
			var serializedPartials = values[1];
			var serializedPartialsArray = objectValues(serializedPartials);
			var serializedTemplates = serializedPartialsArray.concat(serializedTemplate);
			return serializedTemplates.join('\n');
		});


	function serializePartials(partials, templateName) {
		if (!partials) { return Promise.resolve({}); }
		var partialIds = Object.keys(partials);
		var partialPaths = partialIds.map(
			function(partialId) { return partials[partialId]; }
		);
		return Promise.all(
			partialPaths.map(function(partialPath, index) {
				var partialId = partialIds[index];
				var partialName = templateName + ':' + partialId;
				return serializePartial(partialPath, partialName);
			})
		).then(function(compiledPartials) {
			return compiledPartials.reduce(function(compiledPartialsHash, compiledPartial, index) {
				var partialId = partialIds[index];
				compiledPartialsHash[partialId] = compiledPartial;
				return compiledPartialsHash;
			}, {});
		});
	}
}

function wrapHtmlbarsTemplate(template, options) {
	options = options || {};
	var namespace = options.namespace;
	var templateName = options.name;
	return '(' + namespace + '=' + namespace + '||{})["' + templateName + '"]=' + template + ';';
}

function objectValues(object) {
	return Object.keys(object).map(function(key) {
		return object[key];
	});
}

module.exports = engine;
