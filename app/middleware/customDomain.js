'use strict';

var SiteService = require('../services/SiteService');

module.exports = function(dataService) {
	return function(req, res, next) {
		var domain = req.host;
		var siteService = new SiteService(dataService);
		siteService.retrieveSitePathByDomain(domain)
			.then(function(sitePath) {
				if (sitePath) {
					var userAlias = sitePath.user;
					var siteAlias = sitePath.site;
					req.url = getRedirectedUrl(req, userAlias, siteAlias);
					res.locals.domainResolved = true;
				}
				next();
			})
			.catch(function(error) {
				next(error);
			});
	};


	function getRedirectedUrl(req, userAlias, siteAlias) {
		return '/sites/' + userAlias + (siteAlias ? '/' + siteAlias : '') + (req.path === '/' ? '' : req.path);
	}
};
