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
	var host = options.host;
	var appKey = options.appKey;
	var appSecret = options.appSecret;
	var templatesUrl = options.templatesUrl;

	if (!host) { throw new Error('Missing hostname'); }
	if (!appKey) { throw new Error('Missing Dropbox app key'); }
	if (!appSecret) { throw new Error('Missing Dropbox app secret'); }
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
				siteUsername: passportUser.model.username
			});
			return callback(null, serializedUser);
		});

		passport.deserializeUser(function(serializedUser, callback) {
			var deserializedUser = JSON.parse(serializedUser);
			var username = deserializedUser.user;
			var siteName = deserializedUser.site;
			var siteUsername = deserializedUser.siteUsername;

			var userService = new UserService(database);
			userService.retrieveUser(username)
				.then(function(userModel) {
					var uid = userModel.uid;
					var accessToken = userModel.token;
					var siteService = new SiteService(database, {
						host: host,
						appKey: appKey,
						appSecret: appSecret,
						accessToken: accessToken
					});
					return siteService.retrieveSiteAuthenticationDetails(uid, siteName)
						.then(function(authenticationDetails) {
							var validUsers = authenticationDetails.users;
							var matchedUsers = validUsers.filter(function(validUser) {
								return validUser.username === siteUsername;
							});

							if (matchedUsers.length === 0) {
								throw new Error('Username not found: "' + siteUsername + '"');
							}

							var siteUserModel = matchedUsers[0];
							var passportUser = {
								user: username,
								site: siteName,
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
			function(req, siteUsername, sitePassword, callback) {
				var username = req.params.user;
				var siteName = req.params.site;

				var userService = new UserService(database);
				userService.retrieveUser(username)
					.then(function(userModel) {
						var uid = userModel.uid;
						var accessToken = userModel.token;
						var siteService = new SiteService(database, {
							host: host,
							appKey: appKey,
							appSecret: appSecret,
							accessToken: accessToken
						});
						return siteService.retrieveSiteAuthenticationDetails(uid, siteName)
							.then(function(authenticationDetails) {
								var isPrivate = authenticationDetails.private;
								if (!isPrivate) { return callback(null, true); }

								var validUsers = authenticationDetails.users;
								var authenticationService = new AuthenticationService();
								return authenticationService.authenticate(siteUsername, sitePassword, validUsers)
									.then(function(siteUserModel) {
										if (!siteUserModel) { return callback(null, false); }

										var passportUser = {
											user: username,
											site: siteName,
											model: siteUserModel
										};
										return callback(null, passportUser);
									});
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
			initDefaultSiteRoutes(app);
			initAuthRoutes(app, templatesUrl);


			function initDefaultSiteRoutes() {
				app.get('/:user', createDefaultSiteRoute());
				app.get('/:user/login', createDefaultSiteRoute('/login'));
				app.post('/:user/login', createDefaultSiteRoute('/login'));
				app.get('/:user/logout', createDefaultSiteRoute('/logout'));
				app.get('/:user/download/*', createDefaultSiteRoute('/download/*'));
				app.get('/:user/thumbnail/*', createDefaultSiteRoute('/thumbnail/*'));


				function createDefaultSiteRoute(pathSuffix) {
					pathSuffix = pathSuffix || '';
					return function(req, res, next) {
						var username = req.params.user;
						retrieveUserDefaultSiteName(username)
							.then(function(siteName) {
								if (!siteName) {
									throw new HttpError(404);
								}
								var wildcardPath = req.params[0];
								var WILDCARD_REGEXP = /\/\*$/;
								var fullPath = pathSuffix.replace(WILDCARD_REGEXP, '/' + wildcardPath);
								req.url = '/' + username + '/' + siteName + fullPath;
								next();
							})
							.catch(function(error) {
								next(error);
							});
					};
				}
			}

			function initAuthRoutes(app, templatesUrl) {
				app.get('/:user/:site/login', redirectIfLoggedIn, loginRoute);
				app.post('/:user/:site/login', processLoginRoute);
				app.get('/:user/:site/logout', processLogoutRoute);


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
					var username = req.params.user;
					var siteName = req.params.site;
					retrieveUser(username)
						.then(function(userModel) {
							var uid = userModel.uid;
							var accessToken = userModel.token;
							var includeContents = false;
							return retrieveSite(accessToken, uid, siteName, includeContents)
								.then(function(siteModel) {
									var context = {
										siteRoot: getSiteRootUrl(req, '/login'),
										templateRoot: templatesUrl + siteModel.template.name + '/',
										template: siteModel.template.options,
										site: {
											private: siteModel.private
										}
									};
									var templatePath = 'themes/' + siteModel.template.name + '/login';
									res.render(templatePath, context);
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
		}

		function initPrivateRoutes(app, templatesUrl) {
			app.get('/:user/:site', ensureAuth, siteRoute);
			app.get('/:user/:site/download/*', ensureAuth, downloadRoute);
			app.get('/:user/:site/thumbnail/*', ensureAuth, thumbnailRoute);


			function ensureAuth(req, res, next) {
				var username = req.params.user;
				var siteName = req.params.site;
				if (req.isAuthenticated()) {
					var isLoggedIntoDifferentSite = (req.params.user !== req.user.user) || (req.params.site !== req.user.site);
					if (isLoggedIntoDifferentSite) {
						req.logout();
						req.session.destroy();
					} else {
						return next();
					}
				}
				retrieveUser(username)
					.then(function(userModel) {
						var uid = userModel.uid;
						var accessToken = userModel.token;
						return retrieveSiteAuthenticationDetails(accessToken, uid, siteName)
							.then(function(authenticationDetails) {
								var isPrivate = authenticationDetails.private;
								if (!isPrivate) { return next(); }

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
				var username = req.params.user;
				var siteName = req.params.site;
				retrieveUser(username)
					.then(function(userModel) {
						var uid = userModel.uid;
						var accessToken = userModel.token;
						var includeContents = true;
						return retrieveSite(accessToken, uid, siteName, includeContents)
							.then(function(siteModel) {
								var siteContents = siteModel.contents || { folders: null, files: null };
								var context = {
									siteRoot: getSiteRootUrl(req),
									templateRoot: templatesUrl + siteModel.template.name + '/',
									template: siteModel.template.options,
									site: {
										private: siteModel.private
									},
									contents: siteContents
								};
								var templateName = 'themes/' + siteModel.template.name + '/index';
								res.render(templateName, context);
							});
					})
					.catch(function(error) {
						next(error);
					});
			}

			function downloadRoute(req, res, next) {
				var username = req.params.user;
				var siteName = req.params.site;
				var filePath = req.params[0];

				retrieveUser(username)
					.then(function(userModel) {
						var uid = userModel.uid;
						var accessToken = userModel.token;
						return retrieveSiteDownloadLink(accessToken, uid, siteName, filePath)
							.then(function(downloadUrl) {
								res.redirect(downloadUrl);
							});
					})
					.catch(function(error) {
						next(error);
					});
			}

			function thumbnailRoute(req, res, next) {
				var username = req.params.user;
				var siteName = req.params.site;
				var filePath = req.params[0];

				retrieveUser(username)
					.then(function(userModel) {
						var uid = userModel.uid;
						var accessToken = userModel.token;
						return retrieveSiteThumbnailLink(accessToken, uid, siteName, filePath)
							.then(function(thumbnailUrl) {
								res.redirect(thumbnailUrl);
							});
					})
					.catch(function(error) {
						next(error);
					});
			}
		}

		function retrieveUserDefaultSiteName(username) {
			var userService = new UserService(database);
			return userService.retrieveUserDefaultSiteName(username);
		}

		function retrieveUser(username) {
			var userService = new UserService(database);
			return userService.retrieveUser(username);
		}

		function retrieveSite(accessToken, uid, siteName, includeContents) {
			var siteService = new SiteService(database, {
				host: host,
				appKey: appKey,
				appSecret: appSecret,
				accessToken: accessToken
			});
			return siteService.retrieveSite(uid, siteName, {
				published: true,
				contents: includeContents,
				users: false
			});
		}

		function retrieveSiteAuthenticationDetails(accessToken, uid, siteName) {
			var siteService = new SiteService(database, {
				host: host,
				appKey: appKey,
				appSecret: appSecret,
				accessToken: accessToken
			});
			return siteService.retrieveSiteAuthenticationDetails(uid, siteName);
		}

		function retrieveSiteDownloadLink(accessToken, uid, siteName, filePath) {
			var siteService = new SiteService(database, {
				host: host,
				appKey: appKey,
				appSecret: appSecret,
				accessToken: accessToken
			});
			return siteService.retrieveSiteDownloadLink(uid, siteName, filePath);
		}

		function retrieveSiteThumbnailLink(accessToken, uid, siteName, filePath) {
			var siteService = new SiteService(database, {
				host: host,
				appKey: appKey,
				appSecret: appSecret,
				accessToken: accessToken
			});
			return siteService.retrieveSiteThumbnailLink(uid, siteName, filePath);
		}
	}
};
