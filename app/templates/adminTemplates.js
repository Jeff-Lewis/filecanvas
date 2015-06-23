'use strict';

var TemplateService = require('../services/TemplateService');

var templateService = new TemplateService();

var indexTemplate = templateService.compile('templates/admin/index.hbs');

function createAdminPageTemplate(templatePath) {
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

module.exports = {
	'LOGIN': createAdminPageTemplate('templates/admin/login.hbs'),

	'FAQ': createAdminPageTemplate('templates/admin/faq.hbs'),
	'SUPPORT': createAdminPageTemplate('templates/admin/support.hbs'),
	'ACCOUNT': createAdminPageTemplate('templates/admin/account.hbs'),

	'ORGANIZATION': createAdminPageTemplate('templates/admin/organization.hbs'),
	'ORGANIZATION_SHARES': createAdminPageTemplate('templates/admin/organization/shares.hbs'),
	'ORGANIZATION_USERS': createAdminPageTemplate('templates/admin/organization/users.hbs'),
	'ORGANIZATION_USERS_ADD': createAdminPageTemplate('templates/admin/organization/users/add.hbs'),
	'ORGANIZATION_USERS_EDIT': createAdminPageTemplate('templates/admin/organization/users/edit.hbs'),

	'SITES': createAdminPageTemplate('templates/admin/sites.hbs'),
	'SITES_ADD': createAdminPageTemplate('templates/admin/sites/add.hbs'),
	'SITES_EDIT': createAdminPageTemplate('templates/admin/sites/edit.hbs'),
	'SITES_EDIT_USERS': createAdminPageTemplate('templates/admin/sites/edit/users.hbs'),
	'SITES_EDIT_DOMAINS': createAdminPageTemplate('templates/admin/sites/edit/domains.hbs')
};
