module.exports = (function() {
	'use strict';

	var siteTemplates = require('../templates/siteTemplates');

	var TEMPLATES_ROOT_URL = '//templates.${HOST}/';

	function SiteTemplateService(templateName) {
		this.templateName = templateName;
	}

	SiteTemplateService.prototype.templateName = null;

	SiteTemplateService.prototype.render = function(siteModel, hostname) {
		var siteTemplatesRoot = TEMPLATES_ROOT_URL.replace(/\$\{HOST\}/g, hostname);
		var siteContents = siteModel.contents;
		var title = siteModel.title;
		var siteTemplate = siteTemplates[this.templateName];
		var siteTemplateRoot = siteTemplatesRoot + this.templateName + '/';

		return siteTemplate({
			title: title,
			templateRoot: siteTemplateRoot,
			contents: siteContents,
			folders: siteContents.folders,
			files: siteContents.files
		});
	};

	SiteTemplateService.prototype.templatesRoot = null;
	SiteTemplateService.prototype.templatesRoot = null;

	return SiteTemplateService;
})();
