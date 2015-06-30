'use strict';

var SiteService = require('../services/SiteService');

module.exports = function(dataService) {
	return function(req, res, next) {
		var domain = req.host;
		var siteService = new SiteService(dataService);
		siteService.retrieveSitePathByDomain(domain)
			.then(function(siteInfo) {
				if (siteInfo) {
					req.url = getRedirectedUrl(req, siteInfo.user, siteInfo.site);
					res.locals.domainResolved = true;
				}
				next();
			})
			.catch(function(error) {
				next(error);
			});
	};


	function getRedirectedUrl(req, userAlias, siteAlias) {
		return '/sites/' + userAlias + '/' + siteAlias + req.path;
	}
};
