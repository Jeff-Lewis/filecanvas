'use strict';

var siteTemplates = require('../templates/siteTemplates');

var templatesRootUrl = require('../../config').urls.templates;

function SiteTemplateService(templateName) {
	this.templateName = templateName;
}

SiteTemplateService.prototype.templateName = null;
SiteTemplateService.prototype.templatesRoot = null;

SiteTemplateService.prototype.renderLoginPage = function(siteModel, siteRoot, hostname) {
	var siteTemplatesRoot = templatesRootUrl.replace(/\$\{HOST\}/g, hostname);
	var title = siteModel.title;
	var siteTemplate = siteTemplates[this.templateName].login;
	var siteTemplateRoot = siteTemplatesRoot + this.templateName + '/';

	return siteTemplate({
		title: title,
		siteRoot: siteRoot,
		templateRoot: siteTemplateRoot
	});
};

SiteTemplateService.prototype.renderIndexPage = function(siteModel, siteRoot, hostname) {
	var siteTemplatesRoot = templatesRootUrl.replace(/\$\{HOST\}/g, hostname);
	var siteContents = siteModel.contents || { folders: null, files: null };
	var title = siteModel.title;
	var siteTemplate = siteTemplates[this.templateName].index;
	var siteTemplateRoot = siteTemplatesRoot + this.templateName + '/';

	return siteTemplate({
		title: title,
		siteRoot: siteRoot,
		templateRoot: siteTemplateRoot,
		contents: siteContents,
		folders: siteContents.folders,
		files: siteContents.files
	});
};

module.exports = SiteTemplateService;
