module.exports = (function() {
	'use strict';

	var TemplateService = require('../services/TemplateService');

	var templateService = new TemplateService();

	var indexTemplate = templateService.compile('templates/admin/index.hbs');

	return {
		'HOME': _createAdminPageTemplate('templates/admin/home.hbs'),
		'FAQ': _createAdminPageTemplate('templates/admin/faq.hbs'),
		'SUPPORT': _createAdminPageTemplate('templates/admin/support.hbs'),
		'ACCOUNT_SETTINGS': _createAdminPageTemplate('templates/admin/account.hbs'),
		'SITE_ADD': _createAdminPageTemplate('templates/admin/sites/add.hbs'),
		'SITE_DETAIL': _createAdminPageTemplate('templates/admin/sites/edit.hbs')
	};

	function _createAdminPageTemplate(templatePath) {
		var pageContentTemplate = templateService.compile(templatePath);

		return function(context, options) {
			var pageContent = pageContentTemplate(context, options);

			var indexTemplateOptions = {
				partials: {
					'page': pageContent
				}
			};
			return indexTemplate(context, indexTemplateOptions);
		};
	}
})();
