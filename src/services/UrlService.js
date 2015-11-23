'use strict';

var url = require('url');

function UrlService(req) {
	this.subdomains = req.subdomains;
	this.subdomain = this.subdomains.join('.');
	this.location = url.parse(req.protocol + '://' + req.get('host') + req.originalUrl);
}

UrlService.prototype.location = null;
UrlService.prototype.subdomains = null;

UrlService.prototype.getSubdomainUrl = function(subdomain, path) {
	var currentSubdomain = (this.subdomains ? this.subdomains.join('.') : null);
	var subdomainLength = (currentSubdomain ? currentSubdomain.length + '.'.length : 0);
	var baseUrl = this.location.host.substr(subdomainLength);
	return this.location.protocol + '//' + (subdomain ? subdomain + '.' : '') + baseUrl + (path || '/');
};

module.exports = UrlService;
