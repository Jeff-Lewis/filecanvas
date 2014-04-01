module.exports = (function() {
	'use strict';

	var TemplateService = require('../services/TemplateService');

	var templateService = new TemplateService();

	var indexTemplate = templateService.compile('templates/admin/index.hbs');

	return {
		'FAQ': _createAdminPageTemplate('templates/admin/faq.hbs'),
		'SUPPORT': _createAdminPageTemplate('templates/admin/support.hbs'),
		'ACCOUNT': _createAdminPageTemplate('templates/admin/account.hbs'),
		
		'ORGANIZATION': _createAdminPageTemplate('templates/admin/organization.hbs'),
		'ORGANIZATION_SHARES': _createAdminPageTemplate('templates/admin/organization/shares.hbs'),
		'ORGANIZATION_USERS': _createAdminPageTemplate('templates/admin/organization/users.hbs'),
		'ORGANIZATION_USERS_ADD': _createAdminPageTemplate('templates/admin/organization/users/add.hbs'),
		'ORGANIZATION_USERS_EDIT': _createAdminPageTemplate('templates/admin/organization/users/edit.hbs'),

		'SITES': _createAdminPageTemplate('templates/admin/sites.hbs'),
		'SITES_ADD': _createAdminPageTemplate('templates/admin/sites/add.hbs'),
		'SITES_EDIT': _createAdminPageTemplate('templates/admin/sites/edit.hbs'),
		'SITES_EDIT_USERS': _createAdminPageTemplate('templates/admin/sites/edit/users.hbs'),
		'SITES_EDIT_DOMAINS': _createAdminPageTemplate('templates/admin/sites/edit/domains.hbs')
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
