'use strict';

var path = require('path');
var objectAssign = require('object-assign');
var merge = require('lodash.merge');

var resolvePartials = require('../utils/resolvePartials');

function AdminPageService(options) {
	options = options || {};
	var templatesPath = options.templatesPath;
	var partialsPath = options.partialsPath;
	var sessionMiddleware = options.sessionMiddleware;
	var analyticsConfig = options.analytics;

	if (!templatesPath) { throw new Error('Missing templates path'); }
	if (!partialsPath) { throw new Error('Missing partials path'); }
	if (!sessionMiddleware) { throw new Error('Missing session middleware'); }
	if (!analyticsConfig) { throw new Error('Missing analytics configuration'); }

	this.templatesPath = templatesPath;
	this.partials = resolvePartials(partialsPath);
	this.analyticsConfig = analyticsConfig;

	this.loadSessionData = function(req, res) {
		return new Promise(function(resolve, reject) {
			sessionMiddleware(req, res, function(error) {
				if (error) { return reject(error); }
				resolve();
			});
		});
	};
}

AdminPageService.prototype.template = null;

AdminPageService.prototype.getTemplatePath = function(templateName) {
	return path.resolve(this.templatesPath, templateName + '.hbs');
};

AdminPageService.prototype.render = function(req, res, options) {
	options = options || {};
	var pageTemplateName = options.template;
	var context = options.context || null;
	var templateOptions = merge({}, { partials: this.partials }, options.options);
	var analyticsConfig = this.analyticsConfig;

	return this.loadSessionData(req, res)
		.then(function() {
			var templateData = getTemplateData(req, res, context, templateOptions, analyticsConfig);
			if (req.session && req.session.state) {
				delete req.session.state;
			}
			return renderTemplate(pageTemplateName, templateData)
				.then(function(data) {
					res.send(data);
					return data;
				});
		});


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

function getTemplateData(req, res, context, templateOptions, analyticsConfig) {
	templateOptions = templateOptions || null;
	var templateData = {
		_: templateOptions,
		session: getTemplateSessionData(req, res)
	};
	return objectAssign({}, context, templateData);

	function getTemplateSessionData(req, res) {
		var session = {
			state: req.session && req.session.state || null,
			user: req.user || null,
			analytics: analyticsConfig
		};
		return objectAssign({}, res.locals, session);
	}
}
