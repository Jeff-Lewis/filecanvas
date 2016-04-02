'use strict';

var assert = require('assert');
var objectAssign = require('object-assign');
var merge = require('lodash.merge');

var resolvePartials = require('../utils/resolvePartials');

function AdminPageService(options) {
	options = options || {};
	var templatesPath = options.templatesPath;
	var partialsPath = options.partialsPath;
	var sessionMiddleware = options.sessionMiddleware;
	var analyticsConfig = options.analytics;

	assert(templatesPath, 'Missing templates path');
	assert(partialsPath, 'Missing partials path');
	assert(sessionMiddleware, 'Missing session middleware');
	assert(analyticsConfig, 'Missing analytics configuration');

	this.templatesPath = templatesPath;
	this.partials = resolvePartials(partialsPath);
	this.sessionMiddleware = sessionMiddleware;
	this.analyticsConfig = analyticsConfig;
}

AdminPageService.prototype.templatesPath = null;
AdminPageService.prototype.partials = null;
AdminPageService.prototype.sessionMiddleware = null;
AdminPageService.prototype.analyticsConfig = null;

AdminPageService.prototype.render = function(req, res, options) {
	options = options || {};
	var pageTemplateName = options.template;
	var context = options.context || null;
	var templateOptions = merge({}, { partials: this.partials }, options.options);
	var sessionMiddleware = this.sessionMiddleware;
	var analyticsConfig = this.analyticsConfig;

	return loadSessionData(sessionMiddleware, req, res)
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


	function loadSessionData(sessionMiddlewa, req, res) {
		return new Promise(function(resolve, reject) {
			sessionMiddleware(req, res, function(error) {
				if (error) { return reject(error); }
				resolve();
			});
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
