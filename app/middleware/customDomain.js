'use strict';

var SiteService = require('../services/SiteService');

module.exports = function(dataService) {
	return function(req, res, next) {
		var domain = req.host;
		var siteService = new SiteService(dataService);
		siteService.retrieveSiteByDomain(domain)
			.then(function(siteModel) {
				if (siteModel) {
					req.url = getRedirectedUrl(req, siteModel);
					res.locals.domainResolved = true;
				}
				next();
			})
			.catch(function(error) {
				next(error);
			});
	};


	function getRedirectedUrl(req, siteModel) {
		var organizationAlias = siteModel.organization;
		var siteAlias = siteModel.alias;
		var redirectedUrl = '/sites/' + organizationAlias + '/' + siteAlias + req.path;
		return redirectedUrl;
	}
};
