'use strict';

var express = require('express');
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;

var config = require('../../config');
var globals = require('../globals');

var handlebarsEngine = require('../engines/handlebars');

var OrganizationService = require('../services/OrganizationService');
var SiteService = require('../services/SiteService');
var AuthenticationService = require('../services/AuthenticationService');

module.exports = function(dataService, dropboxService) {
	var app = express();

	passport.use('site/local', new LocalStrategy({ passReqToCallback: true }, siteAuth));
	globals.passport.serializers['site'] = serializeSiteAuthUser;
	globals.passport.deserializers['site'] = deserializeSiteAuthUser;


	app.get('/:organization', defaultRoute);
	app.get('/:organization/login', defaultLoginRoute);
	app.post('/:organization/login', defaultLoginRoute);
	app.get('/:organization/logout', defaultLogoutRoute);
	app.get('/:organization/download/*', defaultDownloadRoute);

	app.get('/:organization/:site/login', loginAuthCheck, loginRoute);
	app.post('/:organization/:site/login', processLoginRoute);
	app.get('/:organization/:site/logout', processLogoutRoute);

	app.get('/:organization/:site', ensureAuth, siteRoute);
	app.get('/:organization/:site/download/*', ensureAuth, downloadRoute);

	app.engine('hbs', handlebarsEngine);
	app.set('views', './templates/sites');
	app.set('view engine', 'hbs');

	return app;


	function processLoginRoute(req, res, next) {
		passport.authenticate('site/local', function(error, user, info) {
			if (error) {
				next(error);
				return;
			}
			var loginWasSuccessful = Boolean(user);
			var requestPath = req.originalUrl.split('?')[0];
			if (loginWasSuccessful) {
				req.logIn(user, function(error) {
					if (error) {
						next(error);
						return;
					}
					var redirectParam = req.param('redirect');
					var redirectUrl = redirectParam || requestPath.replace(/\/login$/, '') || '/';
					res.redirect(redirectUrl);
				});
			} else {
				var siteLoginUrl = requestPath;
				res.redirect(siteLoginUrl);
			}
		})(req, res, next);
	}

	function ensureAuth(req, res, next) {
		if (req.isAuthenticated()) {
			next();
			return;
		}

		var organizationAlias = req.params.organization;
		var siteAlias = req.params.site;

		var siteService = new SiteService(dataService, dropboxService);
		siteService.retrieveAuthenticationDetails(organizationAlias, siteAlias)
			.then(function(authenticationDetails) {
				var isPublic = authenticationDetails.public;
				if (isPublic) {
					next();
					return;
				}

				var requestPath = req.originalUrl.split('?')[0];

				// TODO: Generate login link correctly for download URLs
				var siteLoginUrl = '/login';
				var isDownloadLink = (requestPath.indexOf('/download') === 0);
				if (isDownloadLink) {
					siteLoginUrl += '?redirect=' + encodeURIComponent(requestPath);
				} else {
					siteLoginUrl = (requestPath === '/' ? '' : requestPath) + siteLoginUrl;
				}
				res.redirect(siteLoginUrl);
			})
			.catch(function(error) {
				next(error);
			});
	}

	function loginAuthCheck(req, res, next) {
		if (req.isAuthenticated()) {
			var requestPath = req.originalUrl.split('?')[0];
			var redirectParam = req.param('redirect');
			var redirectUrl = (redirectParam || requestPath.substr(0, requestPath.lastIndexOf('/login')) || '/');
			return res.redirect(redirectUrl);
		}
		next();
	}

	function siteAuth(req, username, password, callback) {
		var organizationAlias = req.params.organization;
		var siteAlias = req.params.site;

		var siteService = new SiteService(dataService, dropboxService);
		siteService.retrieveAuthenticationDetails(organizationAlias, siteAlias)
			.then(function(authenticationDetails) {
				var isPublic = authenticationDetails.public;
				if (isPublic) { return callback(null, true); }

				var validUsers = authenticationDetails.users;
				var authenticationService = new AuthenticationService();
				var siteUserModel = authenticationService.authenticate(username, password, validUsers);

				if (!siteUserModel) { return callback(null, false); }

				var passportUser = {
					type: 'site',
					organization: organizationAlias,
					site: siteAlias,
					model: siteUserModel
				};
				return callback(null, passportUser);
			})
			.catch(function(error) {
				return callback(error);
			});
	}

	function serializeSiteAuthUser(passportUser, callback) {
		var serializedUser = JSON.stringify({
			organization: passportUser.organization,
			site: passportUser.site,
			username: passportUser.model.username
		});
		return callback(null, serializedUser);
	}

	function deserializeSiteAuthUser(serializedUser, callback) {
		var deserializedUser = JSON.parse(serializedUser);
		var organizationAlias = deserializedUser.organization;
		var siteAlias = deserializedUser.site;
		var username = deserializedUser.username;

		var siteService = new SiteService(dataService, dropboxService);
		siteService.retrieveAuthenticationDetails(organizationAlias, siteAlias)
			.then(function(authenticationDetails) {
				var validUsers = authenticationDetails.users;
				var matchedUsers = validUsers.filter(function(validUser) {
					return validUser.username === username;
				});

				if (matchedUsers.length === 0) {
					var error = new Error('Username not found: "' + username + '"');
					throw error;
				}

				var siteUserModel = matchedUsers[0];
				var passportUser = {
					type: 'site',
					organization: organizationAlias,
					site: siteAlias,
					model: siteUserModel
				};
				return callback(null, passportUser);
			})
			.catch(function(error) {
				return callback(error);
			});
	}

	function processLogoutRoute(req, res, next) {
		req.logout();
		req.session.destroy();
		var requestPath = req.originalUrl.split('?')[0];
		var redirectUrl = requestPath.substr(0, requestPath.lastIndexOf('/logout')) || '/';
		res.redirect(redirectUrl);
	}

	function defaultRoute(req, res, next) {
		var organizationAlias = req.params.organization;
		var organizationService = new OrganizationService(dataService);

		organizationService.retrieveOrganizationDefaultSiteAlias(organizationAlias)
			.then(function(siteAlias) {
				if (!siteAlias) {
					var error = new Error();
					error.status = 404;
					throw error;
				}
				req.url += '/' + siteAlias;
				next();
			})
			.catch(function(error) {
				next(error);
			});
	}

	function defaultLoginRoute(req, res, next) {
		var organizationAlias = req.params.organization;
		var organizationService = new OrganizationService(dataService);

		organizationService.retrieveOrganizationDefaultSiteAlias(organizationAlias)
			.then(function(siteAlias) {
				if (!siteAlias) {
					var error = new Error();
					error.status = 404;
					throw error;
				}
				req.url = '/' + organizationAlias + '/' + siteAlias + '/login';
				next();
			})
			.catch(function(error) {
				next(error);
			});
	}

	function defaultLogoutRoute(req, res, next) {
		var organizationAlias = req.params.organization;
		var organizationService = new OrganizationService(dataService);

		organizationService.retrieveOrganizationDefaultSiteAlias(organizationAlias)
			.then(function(siteAlias) {
				if (!siteAlias) {
					var error = new Error();
					error.status = 404;
					throw error;
				}
				req.url = '/' + organizationAlias + '/' + siteAlias + '/logout';
				next();
			})
			.catch(function(error) {
				next(error);
			});
	}

	function defaultDownloadRoute(req, res, next) {
		var organizationAlias = req.params.organization;
		var organizationService = new OrganizationService(dataService);
		var downloadPath = req.params[0];

		organizationService.retrieveOrganizationDefaultSiteAlias(organizationAlias)
			.then(function(siteAlias) {
				if (!siteAlias) {
					var error = new Error();
					error.status = 404;
					throw error;
				}
				req.url = '/' + organizationAlias + '/' + siteAlias + '/download/' + downloadPath;
				next();
			})
			.catch(function(error) {
				next(error);
			});
	}

	function downloadRoute(req, res, next) {
		var organizationAlias = req.params.organization;
		var siteAlias = req.params.site;
		var downloadPath = req.params[0];

		var siteService = new SiteService(dataService, dropboxService);

		siteService.retrieveDownloadLink(organizationAlias, siteAlias, downloadPath)
			.then(function(downloadUrl) {
				res.redirect(downloadUrl);
			})
			.catch(function(error) {
				next(error);
			});
	}

	function siteRoute(req, res, next) {
		var organizationAlias = req.params.organization;
		var siteAlias = req.params.site;

		var siteService = new SiteService(dataService, dropboxService);

		var includeContents = true;
		var includeUsers = false;
		var includeDomains = false;
		siteService.retrieveSite(organizationAlias, siteAlias, includeContents, includeUsers, includeDomains)
			.then(function(siteModel) {
				var hostname = req.get('host').split('.').slice(req.subdomains.length).join('.');
				var requestPath = req.originalUrl.split('?')[0];
				var siteRoot = (requestPath === '/' ? requestPath : requestPath + '/');
				var templateOptions = getSiteTemplateOptions(siteModel, siteRoot, hostname);
				res.render(siteModel.template + '/index', templateOptions);
			})
			.catch(function(error) {
				next(error);
			});


		function getSiteTemplateOptions(siteModel, siteRoot, hostname) {
			var siteTemplatesRoot = config.urls.templates.replace(/\$\{HOST\}/g, hostname);
			var title = siteModel.title;
			var siteContents = siteModel.contents || { folders: null, files: null };
			var siteTemplateRoot = siteTemplatesRoot + siteModel.template + '/';

			return {
				title: title,
				siteRoot: siteRoot,
				templateRoot: siteTemplateRoot,
				contents: siteContents,
				folders: siteContents.folders,
				files: siteContents.files
			};
		}
	}

	function loginRoute(req, res, next) {
		var organizationAlias = req.params.organization;
		var siteAlias = req.params.site;

		var siteService = new SiteService(dataService, dropboxService);

		var includeContents = false;
		var includeUsers = false;
		var includeDomains = false;
		siteService.retrieveSite(organizationAlias, siteAlias, includeContents, includeUsers, includeDomains)
			.then(function(siteModel) {
				var hostname = req.get('host').split('.').slice(req.subdomains.length).join('.');
				var requestPath = req.originalUrl.split('?')[0].replace(/\/login$/, '');
				var siteRoot = (requestPath === '/' ? requestPath : requestPath + '/');
				var templateOptions = getLoginTemplateOptions(siteModel, siteRoot, hostname);
				res.render(siteModel.template + '/login', templateOptions);
			})
			.catch(function(error) {
				next(error);
			});


		function getLoginTemplateOptions(siteModel, siteRoot, hostname) {
			var siteTemplatesRoot = config.urls.templates.replace(/\$\{HOST\}/g, hostname);
			var title = siteModel.title;
			var siteTemplateRoot = siteTemplatesRoot + siteModel.template + '/';

			return {
				title: title,
				siteRoot: siteRoot,
				templateRoot: siteTemplateRoot
			};
		}
	}
};
