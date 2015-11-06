'use strict';

var objectAssign = require('object-assign');

function AdminPageService(options) {
	options = options || {};
	this.template = options.template;
}

AdminPageService.prototype.template = null;

AdminPageService.prototype.render = function(templateName, req, res, context) {
	var indexTemplate = this.template;
	return new Promise(function(resolve, reject) {
		var templateData = getTemplateData(req, res, context);
		res.render(templateName, templateData, function(error, pageContent) {
			if (error) { return reject(error); }
			var templateOptions = {
				partials: {
					'page': pageContent
				}
			};
			var templateData = getTemplateData(req, res, context, templateOptions);
			if (req.session && req.session.state) {
				delete req.session.state;
			}
			res.render(indexTemplate, templateData, function(error, data) {
				if (error) { return reject(error); }
				res.send(data);
				resolve(data);
			});
		});
	});
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
