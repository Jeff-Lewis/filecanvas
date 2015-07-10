'use strict';

var path = require('path');
var express = require('express');
var Passport = require('passport').Passport;
var LocalStrategy = require('passport-local').Strategy;

var transport = require('../middleware/transport');
var invalidRoute = require('../middleware/invalidRoute');
var errorHandler = require('../middleware/errorHandler');

var handlebarsEngine = require('../engines/handlebars');

var HttpError = require('../errors/HttpError');

var UserService = require('../services/UserService');
var SiteService = require('../services/SiteService');
var AuthenticationService = require('../services/AuthenticationService');

module.exports = function(database, options) {
	options = options || {};
	var templatesUrl = options.templatesUrl;

	if (!templatesUrl) { throw new Error('Missing templates root URL'); }

	var app = express();
	var passport = new Passport();

	initAuth(app, passport, database);
	initViewEngine(app, {
		templatesPath: path.resolve(__dirname, '../../templates/sites')
	});
	initRoutes(app, passport, database, {
		templatesUrl: templatesUrl
	});
	initErrorHandler(app, {
		template: 'error'
	});

	return app;


	function initAuth(app, passport, database) {
		app.use(transport());
		app.use(passport.initialize());
		app.use(passport.session());

		passport.serializeUser(function(passportUser, callback) {
			var serializedUser = JSON.stringify({
				user: passportUser.user,
				site: passportUser.site,
				username: passportUser.model.username
			});
			return callback(null, serializedUser);
		});

		passport.deserializeUser(function(serializedUser, callback) {
			var deserializedUser = JSON.parse(serializedUser);
			var userAlias = deserializedUser.user;
			var siteAlias = deserializedUser.site;
			var username = deserializedUser.username;

			var userService = new UserService(database);
			userService.retrieveUser(userAlias)
				.then(function(userModel) {
					var uid = userModel.uid;
					var siteService = new SiteService(database);
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
		});

		passport.use('site/local', new LocalStrategy({ passReqToCallback: true },
			function(req, username, password, callback) {
				var userAlias = req.params.user;
				var siteAlias = req.params.site;

				var userService = new UserService(database);
				userService.retrieveUser(userAlias)
					.then(function(userModel) {
						var uid = userModel.uid;
						var siteService = new SiteService(database);
						return siteService.retrieveSiteAuthenticationDetails(uid, siteAlias)
							.then(function(authenticationDetails) {
								var isPublic = authenticationDetails.public;
								if (isPublic) { return callback(null, true); }

								var validUsers = authenticationDetails.users;
								var authenticationService = new AuthenticationService();
								var siteUserModel = authenticationService.authenticate(username, password, validUsers);

								if (!siteUserModel) { return callback(null, false); }

								var passportUser = {
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
	}

	function initViewEngine(app, options) {
		options = options || {};
		var templatesPath = options.templatesPath;

		app.engine('hbs', handlebarsEngine);
		app.set('views', templatesPath);
		app.set('view engine', 'hbs');
	}

	function initErrorHandler(app, options) {
		options = options || {};
		var template = options.template;

		app.use(errorHandler({
			template: template
		}));
	}

	function initRoutes(app, passport, database, options) {
		options = options || {};
		var templatesUrl = options.templatesUrl;

		initPublicRoutes(app, templatesUrl);
		initPrivateRoutes(app, templatesUrl);
		app.use(invalidRoute());


		function getSiteRootUrl(req, currentPath) {
			var requestPath = req.originalUrl.split('?')[0];
			if (currentPath) {
				requestPath = requestPath.replace(new RegExp(currentPath + '$'), '');
			}
			var siteRoot = (requestPath === '/' ? requestPath : requestPath + '/');
			return siteRoot;
		}

		function initPublicRoutes(app, templatesUrl) {
			app.get('/:user', defaultUserSiteRoute);
			app.get('/:user/login', defaultUserSiteLoginRoute);
			app.post('/:user/login', defaultUserSiteLoginRoute);
			app.get('/:user/logout', defaultUserSiteLogoutRoute);
			app.get('/:user/download/*', defaultUserSiteDownloadRoute);

			app.get('/:user/:site/login', redirectIfLoggedIn, loginRoute);
			app.post('/:user/:site/login', processLoginRoute);
			app.get('/:user/:site/logout', processLogoutRoute);


			function defaultUserSiteRoute(req, res, next) {
				var userAlias = req.params.user;

				var userService = new UserService(database);
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

			function defaultUserSiteLoginRoute(req, res, next) {
				var userAlias = req.params.user;

				var userService = new UserService(database);
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

			function defaultUserSiteLogoutRoute(req, res, next) {
				var userAlias = req.params.user;

				var userService = new UserService(database);
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

			function defaultUserSiteDownloadRoute(req, res, next) {
				var userAlias = req.params.user;
				var downloadPath = req.params[0];

				var userService = new UserService(database);
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

			function redirectIfLoggedIn(req, res, next) {
				if (req.isAuthenticated()) {
					var requestPath = req.originalUrl.split('?')[0];
					var redirectParam = req.param('redirect');
					var redirectUrl = (redirectParam || requestPath.substr(0, requestPath.lastIndexOf('/login')) || '/');
					return res.redirect(redirectUrl);
				}
				next();
			}

			function loginRoute(req, res, next) {
				var userAlias = req.params.user;
				var siteAlias = req.params.site;

				var userService = new UserService(database);
				userService.retrieveUser(userAlias)
					.then(function(userModel) {
						var uid = userModel.uid;
						var siteService = new SiteService(database);
						var includeContents = false;
						var includeUsers = false;
						return siteService.retrieveSite(uid, siteAlias, includeContents, includeUsers)
							.then(function(siteModel) {
								var context = {
									title: siteModel.title,
									site: siteModel,
									siteRoot: getSiteRootUrl(req, '/login'),
									templateRoot: templatesUrl + siteModel.template + '/'
								};
								var templateName = 'themes/' + siteModel.template + '/login';
								res.render(templateName, context);
							});
					})
					.catch(function(error) {
						next(error);
					});
			}

			function processLoginRoute(req, res, next) {
				passport.authenticate('site/local', function(error, user, info) {
					if (error) { return next(error); }
					var loginWasSuccessful = Boolean(user);
					var requestPath = req.originalUrl.split('?')[0];
					if (loginWasSuccessful) {
						req.logIn(user, function(error) {
							if (error) { return next(error); }
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
		}

		function initPrivateRoutes(app, templatesUrl) {
			app.get('/:user/:site', ensureAuth, siteRoute);
			app.get('/:user/:site/download/*', ensureAuth, downloadRoute);


			function ensureAuth(req, res, next) {
				var userAlias = req.params.user;
				var siteAlias = req.params.site;

				if (req.isAuthenticated()) {
					var isLoggedIntoDifferentSite = (req.params.user !== req.user.user) || (req.params.site !== req.user.site);
					if (isLoggedIntoDifferentSite) {
						req.logout();
						req.session.destroy();
					} else {
						return next();
					}
				}

				var userService = new UserService(database);
				userService.retrieveUser(userAlias)
					.then(function(userModel) {
						var uid = userModel.uid;
						var siteService = new SiteService(database);
						return siteService.retrieveSiteAuthenticationDetails(uid, siteAlias)
							.then(function(authenticationDetails) {
								var isPublic = authenticationDetails.public;
								if (isPublic) { return next(); }

								var requestPath = req.originalUrl.split('?')[0];

								var siteLoginUrl = '/login';
								var isDownloadLink = (requestPath.indexOf('/download') === 0);
								if (isDownloadLink) {
									// TODO: Generate login redirect link for download URLs (redirect to index page, then download file)
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

			function siteRoute(req, res, next) {
				var userAlias = req.params.user;
				var siteAlias = req.params.site;

				var userService = new UserService(database);
				userService.retrieveUser(userAlias)
					.then(function(userModel) {
						var uid = userModel.uid;
						var siteService = new SiteService(database);
						var includeContents = true;
						var includeUsers = false;
						return siteService.retrieveSite(uid, siteAlias, includeContents, includeUsers)
							.then(function(siteModel) {
								var siteContents = siteModel.contents || { folders: null, files: null };
								var context = {
									title: siteModel.title,
									site: siteModel,
									siteRoot: getSiteRootUrl(req),
									templateRoot: templatesUrl + siteModel.template + '/',
									contents: siteContents
								};
								var templateName = 'themes/' + siteModel.template + '/index';
								res.render(templateName, context);
							});
					})
					.catch(function(error) {
						next(error);
					});
			}

			function downloadRoute(req, res, next) {
				var userAlias = req.params.user;
				var siteAlias = req.params.site;
				var downloadPath = req.params[0];

				var userService = new UserService(database);
				userService.retrieveUser(userAlias)
					.then(function(userModel) {
						var uid = userModel.uid;
						var siteService = new SiteService(database);
						return siteService.retrieveSiteDownloadLink(uid, siteAlias, downloadPath)
							.then(function(downloadUrl) {
								res.redirect(downloadUrl);
							});
					})
					.catch(function(error) {
						next(error);
					});

			}
		}
	}
};
