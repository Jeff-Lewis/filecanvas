module.exports = (function() {
	'use strict';


	function UrlService(req) {
		this.subdomains = req.subdomains;
		this.subdomain = this.subdomains.join('.');

		var protocol = req.protocol;
		var hostIncludingPort = req.get('host');
		var hostExcludingPort = req.host;
		var port = hostIncludingPort.substr(hostExcludingPort.length + ':'.length) || null;
		var path = req.path;
		var queryString = req.originalUrl.substr(req.path.length);
		var href = protocol + '://' + hostIncludingPort + req.originalUrl;

		this.location = {
			href: href,
			protocol: protocol,
			host: hostIncludingPort,
			hostname: hostExcludingPort,
			port: port,
			pathname: path,
			search: queryString
		};
	}

	UrlService.prototype.location = null;
	UrlService.prototype.subdomains = null;

	UrlService.prototype.getSubdomainUrl = function(subdomain, path) {
		var currentSubdomain = (this.subdomains ? this.subdomains.join('.') : null);
		var subdomainLength = (currentSubdomain ? currentSubdomain.length + '.'.length : 0);
		var baseUrl = this.location.host.substr(subdomainLength);
		return this.location.protocol + '://' + (subdomain ? subdomain + '.' : '') + baseUrl + (path || '/');
	};

	return UrlService;
})();
