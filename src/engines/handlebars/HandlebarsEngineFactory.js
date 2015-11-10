'use strict';

var fs = require('fs');
var path = require('path');
var merge = require('lodash.merge');
var memoize = require('lodash.memoize');
var junk = require('junk');

function HandlebarsEngineFactory(handlebarsService, options) {
	options = options || {};
	var templatesNamespace = options.templatesNamespace;
	var partialsNamespace = options.partialsNamespace;
	var defaultTemplateOptions = options.templateOptions;
	var transform = options.transform || null;

	this.handlebarsService = handlebarsService;
	this.templatesNamespace = templatesNamespace;
	this.partialsNamespace = partialsNamespace;
	this.defaultTemplateOptions = defaultTemplateOptions;
	this.transform = transform;

	this.compile = memoize(this.compile);
	this.precompile = memoize(this.precompile);
	this.compileTemplate = memoize(this.compileTemplate);
	this.compilePartial = memoize(this.compilePartial);
	this.serializeTemplate = memoize(this.serializeTemplate, generateTemplateId);
	this.serializePartial = memoize(this.serializePartial, generateTemplateId);
	this.compilePartials = memoize(this.compilePartials);
	this.serializePartials = memoize(this.serializePartials);

	function generateTemplateId(templatePath, templateId) {
		return templateId + ':' + templatePath;
	}
}

HandlebarsEngineFactory.prototype.handlebarsService = null;
HandlebarsEngineFactory.prototype.templatesNamespace = null;
HandlebarsEngineFactory.prototype.partialsNamespace = null;
HandlebarsEngineFactory.prototype.defaultTemplateOptions = null;
HandlebarsEngineFactory.prototype.transform = null;

HandlebarsEngineFactory.prototype.getInstance = function() {
	var self = this;
	var transform = this.transform;

	function engine(templatePath, context, callback) {
		// Extract the Handlebars render options from the
		// magic `_` property within the context hash
		var templateOptions = context._ || {};

		// Render the Handlebars template
		return engine.render(templatePath, context, templateOptions)
			.then(function(output) {
				if (transform) { output = transform(output); }
				callback(null, output);
			})
			.catch(function(error) {
				callback(error);
			});
	}

	engine.preload = function(templatePath, templateId, templateOptions) {
		return Promise.all([
			self.compileTemplateBundle(templatePath, templateOptions),
			self.serializeTemplateBundle(templatePath, templateId, templateOptions)
		]);
	};

	engine.render = function(templatePath, context, templateOptions) {
		return self.compileTemplateBundle(templatePath, templateOptions)
			.then(function(render) {
				return render(context);
			});
	};

	engine.serialize = function(templatePath, templateId, templateOptions) {
		return self.serializeTemplateBundle(templatePath, templateId, templateOptions);
	};

	return engine;
};

HandlebarsEngineFactory.prototype.compile = function(templatePath) {
	return this.handlebarsService.compile(templatePath);
};

HandlebarsEngineFactory.prototype.precompile = function(templatePath) {
	return this.handlebarsService.serialize(templatePath);
};

HandlebarsEngineFactory.prototype.compileTemplate = function(templatePath) {
	return this.compile(templatePath);
};

HandlebarsEngineFactory.prototype.compilePartial = function(templatePath) {
	return this.compile(templatePath);
};

HandlebarsEngineFactory.prototype.serializeTemplate = function(templatePath, templateId) {
	var templatesNamespace = this.templatesNamespace;
	return this.precompile(templatePath)
		.then(function(precompiledTemplate) {
			return wrapHandlebarsTemplate(precompiledTemplate, {
				namespace: templatesNamespace,
				id: templateId
			});
		});
};

HandlebarsEngineFactory.prototype.serializePartial = function(partialPath, partialId) {
	var partialsNamespace = this.partialsNamespace;
	return this.precompile(partialPath)
		.then(function(precompiledPartial) {
			return wrapHandlebarsTemplate(precompiledPartial, {
				namespace: partialsNamespace,
				id: partialId
			});
		});
};

HandlebarsEngineFactory.prototype.compilePartials = function(partialsRoot) {
	if (!partialsRoot) { return Promise.resolve(null); }
	var self = this;
	return loadPartialPaths(partialsRoot)
		.then(function(partialPaths) {
			return Promise.all(
				partialPaths.map(function(partialPath) {
					return self.compilePartial(partialPath);
				})
			).then(function(compiledPartials) {
				return compiledPartials.reduce(function(compiledPartialsHash, compiledPartial, index) {
					var partialPath = partialPaths[index];
					var partialName = getPartialName(partialPath);
					compiledPartialsHash[partialName] = compiledPartial;
					return compiledPartialsHash;
				}, {});
			});
		});
};

HandlebarsEngineFactory.prototype.serializePartials = function(partialsRoot) {
	if (!partialsRoot) { return Promise.resolve([]); }
	var self = this;
	return loadPartialPaths(partialsRoot)
		.then(function(partialPaths) {
			return Promise.all(
				partialPaths.map(function(partialPath) {
					var partialName = getPartialName(partialPath);
					return self.serializePartial(partialPath, partialName);
				})
			).then(function(serializedPartials) {
				return serializedPartials.reduce(function(serializedPartialsHash, serializedPartial, index) {
					var partialPath = partialPaths[index];
					var partialName = getPartialName(partialPath);
					serializedPartialsHash[partialName] = serializedPartial;
					return serializedPartialsHash;
				}, {});
			});
		});
};

HandlebarsEngineFactory.prototype.compileTemplateBundle = function(templatePath, templateOptions) {
	var handlebarsService = this.handlebarsService;
	templateOptions = this.parseTemplateOptions(templateOptions, templatePath);
	var partialsRoot = templateOptions.partials;
	return Promise.all([
		this.compileTemplate(templatePath),
		this.compilePartials(partialsRoot)
	])
		.then(function(values) {
			var compiledTemplate = values[0];
			var compiledPartials = values[1];
			var renderOptions = merge({}, templateOptions, { partials: compiledPartials });
			return function(context) {
				var output = handlebarsService.render(compiledTemplate, context, renderOptions);
				return Promise.resolve(output);
			};
		});
};

HandlebarsEngineFactory.prototype.serializeTemplateBundle = function(templatePath, templateId, templateOptions) {
	templateOptions = this.parseTemplateOptions(templateOptions, templatePath);
	var partialsRoot = templateOptions.partials;
	return Promise.all([
		this.serializeTemplate(templatePath, templateId),
		this.serializePartials(partialsRoot)
	])
		.then(function(values) {
			var serializedTemplate = values[0];
			var serializedPartials = values[1];
			var serializedPartialsArray = objectValues(serializedPartials);
			var serializedTemplates = serializedPartialsArray.concat(serializedTemplate);
			return serializedTemplates.join('\n');
		});
};

HandlebarsEngineFactory.prototype.parseTemplateOptions = function(templateOptions, templatePath) {
	var defaultTemplateOptions = this.defaultTemplateOptions;
	var parsedTemplateOptions = merge({}, defaultTemplateOptions, templateOptions);
	if (parsedTemplateOptions.partials) {
		parsedTemplateOptions.partials = path.resolve(path.dirname(templatePath), templateOptions.partials);
	}
	return parsedTemplateOptions;
};

function loadPartialPaths(dirPath) {
	return loadDirectoryContents(dirPath)
		.catch(function(error) {
			if (error.code === 'ENOENT') {
				return [];
			}
			throw error;
		}).then(function(filenames) {
			return filenames.filter(function(filename) {
				return junk.not(filename);
			}).map(function(filename) {
				return path.join(dirPath, filename);
			});
		});
}

function getPartialName(partialPath) {
	var filename = path.basename(partialPath);
	var partialName = stripExtension(filename);
	return partialName;
}

function wrapHandlebarsTemplate(template, options) {
	options = options || {};
	var namespace = options.namespace;
	var templateId = options.id;
	return '(' + namespace + '=' + namespace + '||{})["' + templateId + '"]=' + template + ';';
}

function loadDirectoryContents(dirPath) {
	return new Promise(function(resolve, reject) {
		fs.readdir(dirPath, function(error, filenames) {
			if (error) { return reject(error); }
			resolve(filenames);
		});
	});
}

function stripExtension(filename) {
	return path.basename(filename, path.extname(filename));
}

function objectValues(object) {
	return Object.keys(object).map(function(key) {
		return object[key];
	});
}

module.exports = HandlebarsEngineFactory;
