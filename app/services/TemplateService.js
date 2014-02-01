module.exports = (function() {
	'use strict';
	
	var templates = require('../templates');

	var TEMPLATES_ROOT_URL = '//templates.${HOST}/';

	function TemplateService(templateName) {
		this.templateName = templateName;
	}

	TemplateService.prototype.templateName = null;

	TemplateService.prototype.render = function(siteModel, hostname) {
		var templatesRoot = TEMPLATES_ROOT_URL.replace(/\$\{HOST\}/g, hostname);
		var siteContents = siteModel.contents;
		var title = siteModel.title;
		var template = templates[this.templateName];
		var templateRoot = templatesRoot + this.templateName + '/';

		return template({
			title: title,
			templateRoot: templateRoot,
			contents: siteContents,
			folders: siteContents.folders,
			files: siteContents.files
		});
	};

	TemplateService.prototype.templatesRoot = null;
	TemplateService.prototype.templatesRoot = null;

	TemplateService.prototype.retrieveDownloadLink = function(path, callback) {
		var generateTemporaryUrl = true;
		this.dropbox.client.makeUrl(path, { download: generateTemporaryUrl }, _handleDownloadLinkRetrieved);


		function _handleDownloadLinkRetrieved(error, shareUrlModel) {
			if (error) { return error && callback(error); }
			return callback && callback(null, shareUrlModel.url);
		}
	};

	return TemplateService;
})();
