'use strict';

var path = require('path');
var objectAssign = require('object-assign');
var merge = require('lodash.merge');

var compileHandlebarsTemplate = require('../engines/handlebars/utils/compile');

function AdminPageService(options) {
	options = options || {};
	this.templatesPath = options.templatesPath;
	this.partialsPath = options.partialsPath;
}

AdminPageService.prototype.template = null;

AdminPageService.prototype.getTemplatePath = function(templateName) {
	return path.resolve(this.templatesPath, templateName + '.hbs');
};

AdminPageService.prototype.getPartialPath = function(partialName) {
	return path.resolve(this.partialsPath, partialName + '.hbs');
};

AdminPageService.prototype.render = function(req, res, options) {
	options = options || {};
	var pageTemplateName = options.template;
	var context = options.context || null;
	var templateOptions = options.options || null;
	var partials = merge({}, options.partials, { index: '_index' });

	var self = this;
	var resolvedPartials = Object.keys(partials).reduce(function(resolvedPartials, partialName) {
		var templateName = partials[partialName];
		resolvedPartials[partialName] = self.getPartialPath(templateName);
		return resolvedPartials;
	}, {});
	return compilePartials(resolvedPartials)
		.then(function(compiledPartials) {
			templateOptions = merge({}, templateOptions, {
				partials: compiledPartials
			});
			var templateData = getTemplateData(req, res, context, templateOptions);
			if (req.session && req.session.state) {
				delete req.session.state;
			}
			return renderTemplate(pageTemplateName, templateData)
				.then(function(data) {
					res.send(data);
					return data;
				});
		});


	function compilePartials(partials) {
		var partialNames = Object.keys(partials);
		return Promise.all(
			partialNames.map(function(partialName) {
				var templatePath = partials[partialName];
				return compileHandlebarsTemplate(templatePath);
			})
		).then(function(compiledPartials) {
			return compiledPartials.reduce(function(compiledPartialsHash, compiledPartial, index) {
				var partialName = partialNames[index];
				compiledPartialsHash[partialName] = compiledPartial;
				return compiledPartialsHash;
			}, {});
		});
	}

	function renderTemplate(templateName, context) {
		return new Promise(function(resolve, reject) {
			res.render(templateName, context, function(error, data) {
				if (error) { return reject(error); }
				resolve(data);
			});
		});
	}
};

module.exports = AdminPageService;

function getTemplateData(req, res, context, templateOptions) {
	templateOptions = templateOptions || null;
	var templateData = {
		_: templateOptions,
		session: getTemplateSessionData(req, res)
	};
	return objectAssign({}, context, templateData);


	function getTemplateSessionData(req, res) {
		var session = {
			state: req.session && req.session.state || null,
			user: req.user || null
		};
		return objectAssign({}, res.locals, session);
	}
}

