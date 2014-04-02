module.exports = (function() {
	'use strict';

	return function(req, res, next) {

		var SiteService = require('../services/SiteService');

		var dataService = require('../globals').dataService;

		var siteService = new SiteService(dataService);

		var domain = req.host;
		siteService.retrieveSiteByDomain(domain, _handleDomainChecked);


		function _handleDomainChecked(error, siteModel) {
			if (error) { return next(error); }
			if (siteModel) {
				console.log(JSON.stringify(siteModel ,null, '\t'));
				req.url = _getRedirectedUrl(req, siteModel);
				res.locals.domainResolved = true;
			}
			next();
		}

		function _getRedirectedUrl(req, siteModel) {
			var organizationAlias = siteModel.organization;
			var siteAlias = siteModel.alias;
			var redirectedUrl = '/sites/' + organizationAlias + '/' + siteAlias;
			return redirectedUrl;
		}
	};

})();
