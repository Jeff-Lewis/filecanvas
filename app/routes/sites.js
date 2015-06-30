'use strict';

var express = require('express');
var passport = require('passport');
var LocalStrategy = require('passport-local').Strategy;

var config = require('../../config');
var globals = require('../globals');

var HttpError = require('../errors/HttpError');

var handlebarsEngine = require('../engines/handlebars');

var UserService = require('../services/UserService');
var SiteService = require('../services/SiteService');
var AuthenticationService = require('../services/AuthenticationService');

module.exports = function(dataService) {
	var app = express();

	initAuth();

	app.get('/:user', defaultRoute);
	app.get('/:user/login', defaultLoginRoute);
	app.post('/:user/login', defaultLoginRoute);
	app.get('/:user/logout', defaultLogoutRoute);
	app.get('/:user/download/*', defaultDownloadRoute);

	app.get('/:user/:site/login', redirectIfLoggedIn, loginRoute);
	app.post('/:user/:site/login', processLoginRoute);
	app.get('/:user/:site/logout', processLogoutRoute);

	app.get('/:user/:site', ensureAuth, siteRoute);
	app.get('/:user/:site/download/*', ensureAuth, downloadRoute);

	app.engine('hbs', handlebarsEngine);
	app.set('views', './templates/sites');
	app.set('view engine', 'hbs');

	return app;



	function initAuth() {
		globals.passport.serializers['site'] = serializeSiteAuthUser;
		globals.passport.deserializers['site'] = deserializeSiteAuthUser;

		passport.use('site/local', new LocalStrategy({ passReqToCallback: true },
			function(req, username, password, callback) {
				var userAlias = req.params.user;
				var siteAlias = req.params.site;

				var userService = new UserService(dataService);
				userService.retrieveUser(userAlias)
					.then(function(userModel) {
						var uid = userModel.uid;
						var siteService = new SiteService(dataService);
						return siteService.retrieveSiteAuthenticationDetails(uid, siteAlias)
							.then(function(authenticationDetails) {
								var isPublic = authenticationDetails.public;
								if (isPublic) { return callback(null, true); }

								var validUsers = authenticationDetails.users;
								var authenticationService = new AuthenticationService();
								var siteUserModel = authenticationService.authenticate(username, password, validUsers);

								if (!siteUserModel) { return callback(null, false); }

								var passportUser = {
									type: 'site',
									user: userAlias,
									site: siteAlias,
									model: siteUserModel
								};
								return callback(null, passportUser);
							});
					})
					.catch(function(error) {
						return callback(error);
					});
			})
		);


		function serializeSiteAuthUser(passportUser, callback) {
			var serializedUser = JSON.stringify({
				user: passportUser.user,
				site: passportUser.site,
				username: passportUser.model.username
			});
			return callback(null, serializedUser);
		}

		function deserializeSiteAuthUser(serializedUser, callback) {
			var deserializedUser = JSON.parse(serializedUser);
			var userAlias = deserializedUser.user;
			var siteAlias = deserializedUser.site;
			var username = deserializedUser.username;

			var userService = new UserService(dataService);
			userService.retrieveUser(userAlias)
				.then(function(userModel) {
					var uid = userModel.uid;
					var siteService = new SiteService(dataService);
					return siteService.retrieveSiteAuthenticationDetails(uid, siteAlias)
						.then(function(authenticationDetails) {
							var validUsers = authenticationDetails.users;
							var matchedUsers = validUsers.filter(function(validUser) {
								return validUser.username === username;
							});

							if (matchedUsers.length === 0) {
								throw new Error('Username not found: "' + username + '"');
							}

							var siteUserModel = matchedUsers[0];
							var passportUser = {
								type: 'site',
								user: userAlias,
								site: siteAlias,
								model: siteUserModel
							};
							return callback(null, passportUser);
						});
				})
				.catch(function(error) {
					return callback(error);
				});
		}
	}

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

	function processLogoutRoute(req, res, next) {
		req.logout();
		req.session.destroy();
		var requestPath = req.originalUrl.split('?')[0];
		var redirectUrl = requestPath.substr(0, requestPath.lastIndexOf('/logout')) || '/';
		res.redirect(redirectUrl);
	}

	function ensureAuth(req, res, next) {
		if (req.isAuthenticated()) {
			// TODO: Check to see whether the user is authenticated for this specific site
			next();
			return;
		}
		var userAlias = req.params.user;
		var siteAlias = req.params.site;

		var userService = new UserService(dataService);
		userService.retrieveUser(userAlias)
			.then(function(userModel) {
				var uid = userModel.uid;
				var siteService = new SiteService(dataService);
				return siteService.retrieveSiteAuthenticationDetails(uid, siteAlias)
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
					});
			})
			.catch(function(error) {
				next(error);
			});
	}

	function redirectIfLoggedIn(req, res, next) {
		if (req.isAuthenticated()) {
			var requestPath = req.originalUrl.split('?')[0];
			var redirectParam = req.param('redirect');
			var redirectUrl = (redirectParam || requestPath.substr(0, requestPath.lastIndexOf('/login')) || '/');
			return res.redirect(redirectUrl);
		}
		next();
	}

	function defaultRoute(req, res, next) {
		var userAlias = req.params.user;

		var userService = new UserService(dataService);
		return userService.retrieveUserDefaultSiteAlias(userAlias)
			.then(function(siteAlias) {
				if (!siteAlias) {
					throw new HttpError(404);
				}
				req.url += '/' + siteAlias;
				next();
			})
			.catch(function(error) {
				next(error);
			});
	}

	function defaultLoginRoute(req, res, next) {
		var userAlias = req.params.user;

		var userService = new UserService(dataService);
		userService.retrieveUserDefaultSiteAlias(userAlias)
			.then(function(siteAlias) {
				if (!siteAlias) {
					throw new HttpError(404);
				}
				req.url = '/' + userAlias + '/' + siteAlias + '/login';
				next();
			})
			.catch(function(error) {
				next(error);
			});
	}

	function defaultLogoutRoute(req, res, next) {
		var userAlias = req.params.user;

		var userService = new UserService(dataService);
		userService.retrieveUserDefaultSiteAlias(userAlias)
			.then(function(siteAlias) {
				if (!siteAlias) {
					throw new HttpError(404);
				}
				req.url = '/' + userAlias + '/' + siteAlias + '/logout';
				next();
			})
			.catch(function(error) {
				next(error);
			});
	}

	function defaultDownloadRoute(req, res, next) {
		var userAlias = req.params.user;
		var downloadPath = req.params[0];

		var userService = new UserService(dataService);
		userService.retrieveUserDefaultSiteAlias(userAlias)
			.then(function(siteAlias) {
				if (!siteAlias) {
					throw new HttpError(404);
				}
				req.url = '/' + userAlias + '/' + siteAlias + '/download/' + downloadPath;
				next();
			})
			.catch(function(error) {
				next(error);
			});
	}

	function downloadRoute(req, res, next) {
		var userAlias = req.params.user;
		var siteAlias = req.params.site;
		var downloadPath = req.params[0];

		var userService = new UserService(dataService);
		userService.retrieveUser(userAlias)
			.then(function(userModel) {
				var uid = userModel.uid;
				var siteService = new SiteService(dataService);
				return siteService.retrieveSiteDownloadLink(uid, siteAlias, downloadPath)
					.then(function(downloadUrl) {
						res.redirect(downloadUrl);
					});
			})
			.catch(function(error) {
				next(error);
			});

	}

	function siteRoute(req, res, next) {
		var userAlias = req.params.user;
		var siteAlias = req.params.site;

		var userService = new UserService(dataService);
		userService.retrieveUser(userAlias)
			.then(function(userModel) {
				var uid = userModel.uid;
				var siteService = new SiteService(dataService);
				var includeContents = true;
				var includeUsers = false;
				var includeDomains = false;
				return siteService.retrieveSite(uid, siteAlias, includeContents, includeUsers, includeDomains)
					.then(function(siteModel) {
						var hostname = req.get('host').split('.').slice(req.subdomains.length).join('.');
						var requestPath = req.originalUrl.split('?')[0];
						var siteRoot = (requestPath === '/' ? requestPath : requestPath + '/');
						var templateOptions = getSiteTemplateOptions(siteModel, siteRoot, hostname);
						res.render(siteModel.template + '/index', templateOptions);
					});
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
				siteRoot: siteRoot,
				site: siteModel,
				title: title,
				templateRoot: siteTemplateRoot,
				contents: siteContents,
				folders: siteContents.folders,
				files: siteContents.files
			};
		}
	}

	function loginRoute(req, res, next) {
		var userAlias = req.params.user;
		var siteAlias = req.params.site;

		var userService = new UserService(dataService);
		userService.retrieveUser(userAlias)
			.then(function(userModel) {
				var uid = userModel.uid;
				var siteService = new SiteService(dataService);
				var includeContents = false;
				var includeUsers = false;
				var includeDomains = false;
				return siteService.retrieveSite(uid, siteAlias, includeContents, includeUsers, includeDomains)
					.then(function(siteModel) {
						var hostname = req.get('host').split('.').slice(req.subdomains.length).join('.');
						var requestPath = req.originalUrl.split('?')[0].replace(/\/login$/, '');
						var siteRoot = (requestPath === '/' ? requestPath : requestPath + '/');
						var templateOptions = getLoginTemplateOptions(siteModel, siteRoot, hostname);
						res.render(siteModel.template + '/login', templateOptions);
					});
			})
			.catch(function(error) {
				next(error);
			});


		function getLoginTemplateOptions(siteModel, siteRoot, hostname) {
			var siteTemplatesRoot = config.urls.templates.replace(/\$\{HOST\}/g, hostname);
			var title = siteModel.title;
			var siteTemplateRoot = siteTemplatesRoot + siteModel.template + '/';

			return {
				siteRoot: siteRoot,
				site: siteModel,
				title: title,
				templateRoot: siteTemplateRoot
			};
		}
	}
};
