'use strict';

var express = require('express');
var Passport = require('passport').Passport;
var LocalStrategy = require('passport-local').Strategy;
var merge = require('lodash.merge');

var session = require('../middleware/session');
var invalidRoute = require('../middleware/invalidRoute');
var errorHandler = require('../middleware/errorHandler');

var loadStorageAdapters = require('../utils/loadStorageAdapters');

var HttpError = require('../errors/HttpError');

var UserService = require('../services/UserService');
var SiteService = require('../services/SiteService');
var AuthenticationService = require('../services/AuthenticationService');
var ThemeService = require('../services/ThemeService');

module.exports = function(database, options) {
	options = options || {};
	var host = options.host;
	var cookieSecret = options.cookieSecret;
	var sessionStore = options.sessionStore;
	var sessionDuration = options.sessionDuration;
	var themesPath = options.themesPath;
	var errorTemplatesPath = options.errorTemplatesPath;
	var themesUrl = options.themesUrl;
	var isPreview = options.preview;
	var adaptersConfig = options.adapters;

	if (!database) { throw new Error('Missing database'); }
	if (!host) { throw new Error('Missing host details'); }
	if (!themesPath) { throw new Error('Missing themes path'); }
	if (!errorTemplatesPath) { throw new Error('Missing error templates path'); }
	if (!themesUrl) { throw new Error('Missing themes root URL'); }
	if (!adaptersConfig) { throw new Error('Missing adapters configuration'); }
	if (!isPreview && !cookieSecret) { throw new Error('Missing cookie secret'); }
	if (!isPreview && !sessionStore) { throw new Error('Missing session store URL'); }
	if (!isPreview && !sessionDuration) { throw new Error('Missing session duration'); }

	var storageAdapters = loadStorageAdapters(adaptersConfig, database);

	var themeService = new ThemeService({
		themesPath: themesPath
	});
	var siteService = new SiteService(database, {
		host: host,
		adapters: storageAdapters
	});
	var userService = new UserService(database);

	var app = express();
	var passport = new Passport();

	if (!isPreview) {
		initAuth(app, passport, database, {
			cookieSecret: cookieSecret,
			sessionStore: sessionStore,
			sessionDuration: sessionDuration
		});
	}
	initRoutes(app, passport, database, {
		themesUrl: themesUrl,
		preview: isPreview
	});
	initErrorHandler(app, {
		templatesPath: errorTemplatesPath,
		template: 'error'
	});

	return app;


	function initAuth(app, passport, database, options) {
		options = options || {};
		var cookieSecret = options.cookieSecret;
		var sessionStore = options.sessionStore;
		var sessionDuration = options.sessionDuration;
		app.use(session({
			cookieSecret: cookieSecret,
			store: sessionStore,
			ttl: sessionDuration
		}));
		app.use(passport.initialize());
		app.use(passport.session());

		passport.serializeUser(function(passportUser, callback) {
			var serializedUser = JSON.stringify({
				user: passportUser.user,
				site: passportUser.site,
				siteUser: (passportUser.model ? passportUser.model.username : null)
			});
			return callback(null, serializedUser);
		});

		passport.deserializeUser(function(serializedUser, callback) {
			var deserializedUser = JSON.parse(serializedUser);
			var username = deserializedUser.user;
			var siteName = deserializedUser.site;
			var siteUsername = deserializedUser.siteUser;

			new Promise(function(resolve, reject) {
				resolve(
					siteService.retrieveSiteAuthenticationDetails(username, siteName, {
						published: true
					})
					.then(function(authenticationDetails) {
						var isPrivate = authenticationDetails.private;
						if (!isPrivate) {
							var anonymousUser = {
								user: username,
								site: siteName,
								model: null
							};
							return callback(null, anonymousUser);
						}
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
					})
				);
			})
			.catch(function(error) {
				return callback(error);
			});
		});

		passport.use('site/local', new LocalStrategy({ passReqToCallback: true },
			function(req, siteUsername, sitePassword, callback) {
				var username = req.params.user;
				var siteName = req.params.site;

				new Promise(function(resolve, reject) {
					resolve(
						siteService.retrieveSiteAuthenticationDetails(username, siteName, {
							published: true
						})
						.then(function(authenticationDetails) {
							var isPrivate = authenticationDetails.private;
							if (!isPrivate) {
								var passportUser = {
									user: username,
									site: siteName,
									model: null
								};
								return callback(null, passportUser);
							}

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
						})
					);
				})
				.catch(function(error) {
					return callback(error);
				});
			})
		);
	}

	function initErrorHandler(app, options) {
		options = options || {};
		var template = options.template;
		var templatesPath = options.templatesPath;

		app.use(invalidRoute());
		app.use(errorHandler({
			template: template,
			templatesPath: templatesPath
		}));
	}

	function initRoutes(app, passport, database, options) {
		options = options || {};
		var isPreview = options.preview;
		var themesUrl = options.themesUrl;

		initDefaultSiteRedirectRoutes(app);
		initAuthRoutes(app, passport, isPreview);
		initSiteRoutes(app, themesUrl, isPreview);


		function initDefaultSiteRedirectRoutes(app) {
			app.get('/:user', createDefaultSiteRedirectRoute());
			app.get('/:user/login', createDefaultSiteRedirectRoute('/login'));
			app.post('/:user/login', createDefaultSiteRedirectRoute('/login'));
			app.get('/:user/logout', createDefaultSiteRedirectRoute('/logout'));
			app.get('/:user/download/*', createDefaultSiteRedirectRoute('/download/*'));
			app.get('/:user/media/*', createDefaultSiteRedirectRoute('/media/*'));
			app.get('/:user/thumbnail/*', createDefaultSiteRedirectRoute('/thumbnail/*'));
			app.get('/:user/redirect/*', createDefaultSiteRedirectRoute('/redirect/*'));


			function createDefaultSiteRedirectRoute(pathSuffix) {
				pathSuffix = pathSuffix || '';
				return function(req, res, next) {
					var username = req.params.user;

					new Promise(function(resolve, reject) {
						resolve(
							userService.retrieveUserDefaultSiteName(username)
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
						);
					})
					.catch(function(error) {
						next(error);
					});
				};
			}
		}

		function initAuthRoutes(app, passport, isPreview) {
			if (isPreview) {
				app.post('/:user/:site/login', processPreviewLoginRoute);
				app.get('/:user/:site/logout', processPreviewLogoutRoute);
			} else {
				app.get('/:user/:site/login', redirectIfLoggedIn);
				app.post('/:user/:site/login', express.urlencoded(), processLoginRoute);
				app.get('/:user/:site/logout', processLogoutRoute);
			}


			function redirectIfLoggedIn(req, res, next) {
				var username = req.params.user;
				var siteName = req.params.site;
				if (req.isAuthenticated()) {
					var isLoggedIntoDifferentSite = (req.params.user !== req.user.user) || (req.params.site !== req.user.site);
					if (!isLoggedIntoDifferentSite) {
						return redirectToSitePage(req, res);
					}
				}

				new Promise(function(resolve, reject) {
					resolve(
						siteService.retrieveSiteAuthenticationDetails(username, siteName, {
							published: true
						})
						.then(function(authenticationDetails) {
							var isPrivate = authenticationDetails.private;
							if (!isPrivate) { return redirectToSitePage(req, res); }
							next();
						})
					);
				})
				.catch(function(error) {
					next(error);
				});


				function redirectToSitePage(req, res) {
					var requestPath = req.originalUrl.split('?')[0];
					var redirectParam = req.params.redirect;
					var redirectUrl = (redirectParam || requestPath.substr(0, requestPath.lastIndexOf('/login')) || '/');
					return res.redirect(redirectUrl);
				}
			}

			function processLoginRoute(req, res, next) {
				passport.authenticate('site/local', function(error, user, info) {
					if (error) { return next(error); }
					var loginWasSuccessful = Boolean(user);
					var requestPath = req.originalUrl.split('?')[0];
					var redirectUrl = req.body.redirect || null;
					if (loginWasSuccessful) {
						ensurePreviousUserLoggedOut(req)
							.then(function() {
								req.login(user, function(error) {
									if (error) { return next(error); }
									var siteIndexUrl = requestPath.replace(/\/login$/, '') || '/';
									res.redirect(siteIndexUrl + (redirectUrl ? '?redirect=' + encodeURIComponent(redirectUrl) : ''));
								});
							})
							.catch(function(error) {
								next(error);
							});
					} else {
						var siteLoginUrl = requestPath;
						res.redirect(siteLoginUrl + '?retry' + (redirectUrl ? '&redirect=' + encodeURIComponent(redirectUrl) : ''));
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

			function processPreviewLoginRoute(req, res, next) {
				var requestPath = req.originalUrl.split('?')[0];
				var redirectUrl = requestPath.substr(0, requestPath.lastIndexOf('/login')) || '/';
				res.redirect(redirectUrl);
			}

			function processPreviewLogoutRoute(req, res, next) {
				var requestPath = req.originalUrl.split('?')[0];
				var redirectUrl = (requestPath.substr(0, requestPath.lastIndexOf('/logout')) || '') + '/login';
				res.redirect(redirectUrl);
			}
		}

		function initSiteRoutes(app, themesUrl, isPreview) {
			app.get('/:user/:site/login', loginRoute);
			app.get('/:user/:site', ensureAuth, siteRoute);
			app.get('/:user/:site/download/*', ensureAuth, downloadRoute);
			app.get('/:user/:site/media/*', ensureAuth, previewRoute);
			app.get('/:user/:site/thumbnail/*', ensureAuth, thumbnailRoute);
			app.get('/:user/:site/redirect/*', ensureAuth, shortcutRoute);


			function ensureAuth(req, res, next) {
				if (isPreview) { return next(); }
				var username = req.params.user;
				var siteName = req.params.site;
				if (req.isAuthenticated()) {
					var isLoggedIntoDifferentSite = (req.params.user !== req.user.user) || (req.params.site !== req.user.site);
					if (!isLoggedIntoDifferentSite) {
						return next();
					}
				}

				new Promise(function(resolve, reject) {
					resolve(
						siteService.retrieveSiteAuthenticationDetails(username, siteName, {
							published: true
						})
						.then(function(authenticationDetails) {
							var isPrivate = authenticationDetails.private;
							if (!isPrivate) {
								return ensurePreviousUserLoggedOut(req)
									.then(function() {
										return next();
									})
									.catch(function(error) {
										return next(error);
									});
							}

							var pathPrefix = '/' + username + '/' + siteName;
							if (req.path.indexOf(pathPrefix) !== 0) {
								throw new HttpError(500);
							}
							var resourcePath = req.path.replace(pathPrefix, '') || '/';
							var requestPath = req.originalUrl.split('?')[0];
							var requestPrefix = (resourcePath === '/' ? requestPath : requestPath.substr(0, requestPath.lastIndexOf(resourcePath)));

							var siteLoginUrl = (requestPrefix === '/' ? '' : requestPrefix) + '/login';
							var needsRedirect = (resourcePath !== '/');
							if (needsRedirect) {
								res.redirect(siteLoginUrl + '?redirect=' + encodeURIComponent((requestPrefix === '/' ? '' : requestPrefix) + resourcePath));
							} else {
								res.redirect(siteLoginUrl);
							}
						})
					);
				})
				.catch(function(error) {
					next(error);
				});
			}

			function getSiteRootUrl(req, currentPath) {
				var requestPath = req.originalUrl.split('?')[0];
				if (currentPath) {
					requestPath = requestPath.replace(new RegExp(currentPath + '$'), '');
				}
				var siteRoot = (requestPath === '/' ? requestPath : requestPath + '/');
				return siteRoot;
			}

			function loginRoute(req, res, next) {
				var username = req.params.user;
				var siteName = req.params.site;
				var isRetryAttempt = ('retry' in req.query);
				var redirectUrl = req.query.redirect || null;
				var themeIdOverride = (isPreview && req.query.theme && req.query.theme.id || null);
				var themeConfigOverrides = null;
				if (isPreview && req.query.theme && req.query.theme.config) {
					try {
						themeConfigOverrides = JSON.parse(req.query['theme.config']);
					} catch (error) {
						return next(new HttpError(400, 'Invalid theme configuration: ' + req.query['theme.config']));
					}
				}

				new Promise(function(resolve, reject) {
					resolve(
						userService.retrieveUser(username)
							.then(function(userModel) {
								var username = userModel.username;
								var published = !isPreview;
								var includeTheme = true;
								var includeContents = false;
								var includeUsers = false;
								var useCached = false;
								return siteService.retrieveSite(username, siteName, {
									published: published,
									theme: includeTheme,
									contents: includeContents,
									users: includeUsers,
									cacheDuration: (useCached ? Infinity : null)
								})
									.then(function(siteModel) {
										var siteTheme = getCustomizedSiteTheme(siteModel, themeIdOverride, themeConfigOverrides);
										var themeId = siteTheme.id;
										var templateData = {
											metadata: {
												siteRoot: getSiteRootUrl(req, '/login'),
												themeRoot: themesUrl + themeId + '/assets/',
												theme: siteTheme,
												retry: isRetryAttempt,
												redirect: redirectUrl
											},
											resource: {
												private: siteModel.private
											}
										};
										if (isPreview) {
											templateData.metadata.admin = true;
											templateData.metadata.preview = true;
										}
										var templateId = 'login';
										renderTemplate(res, themeId, templateId, templateData, next);
									});
							})
					);
				})
				.catch(function(error) {
					next(error);
				});
			}

			function siteRoute(req, res, next) {
				var username = req.params.user;
				var siteName = req.params.site;
				var redirectUrl = req.query.redirect || null;
				var useCached = (req.query.cached === 'true');
				var themeIdOverride = (isPreview && req.query.theme && req.query.theme.id || null);
				var themeConfigOverrides = null;
				if (isPreview && req.query.theme && req.query.theme.config) {
					try {
						themeConfigOverrides = JSON.parse(req.query['theme.config']);
					} catch (error) {
						return next(new HttpError(400, 'Invalid theme configuration: ' + req.query['theme.config']));
					}
				}

				new Promise(function(resolve, reject) {
					resolve(
						userService.retrieveUser(username)
							.then(function(userModel) {
								var username = userModel.username;
								var published = !isPreview;
								var includeTheme = true;
								var includeContents = true;
								var includeUsers = false;
								return siteService.retrieveSite(username, siteName, {
									published: published,
									theme: includeTheme,
									contents: includeContents,
									users: includeUsers,
									cacheDuration: (useCached ? Infinity : null)
								})
									.then(function(siteModel) {
										var siteTheme = getCustomizedSiteTheme(siteModel, themeIdOverride, themeConfigOverrides);
										var themeId = siteTheme.id;
										var templateData = {
											metadata: {
												siteRoot: getSiteRootUrl(req),
												themeRoot: themesUrl + themeId + '/assets/',
												theme: siteTheme
											},
											resource: {
												private: siteModel.private,
												root: siteModel.contents
											}
										};
										if (redirectUrl) {
											templateData.metadata.redirect = redirectUrl;
										}
										if (isPreview) {
											templateData.metadata.admin = true;
											templateData.metadata.preview = true;
										}
										var templateId = 'index';
										renderTemplate(res, themeId, templateId, templateData, next);
									});
							})
					);
				})
				.catch(function(error) {
					next(error);
				});
			}

			function downloadRoute(req, res, next) {
				var username = req.params.user;
				var siteName = req.params.site;
				var filePath = req.params[0];

				new Promise(function(resolve, reject) {
					resolve(
						siteService.retrieveSiteDownloadLink(username, siteName, filePath)
							.then(function(downloadUrl) {
								res.redirect(downloadUrl);
							})
					);
				})
				.catch(function(error) {
					next(error);
				});
			}

			function previewRoute(req, res, next) {
				var username = req.params.user;
				var siteName = req.params.site;
				var filePath = req.params[0];

				new Promise(function(resolve, reject) {
					resolve(
						siteService.retrieveSitePreviewLink(username, siteName, filePath)
							.then(function(previewUrl) {
								res.redirect(previewUrl);
							})
					);
				})
				.catch(function(error) {
					next(error);
				});
			}

			function thumbnailRoute(req, res, next) {
				var username = req.params.user;
				var siteName = req.params.site;
				var filePath = req.params[0];

				new Promise(function(resolve, reject) {
					resolve(
						siteService.retrieveSiteThumbnailLink(username, siteName, filePath)
							.then(function(thumbnailUrl) {
								res.redirect(thumbnailUrl);
							})
					);
				})
				.catch(function(error) {
					next(error);
				});
			}

			function shortcutRoute(req, res, next) {
				var username = req.params.user;
				var siteName = req.params.site;
				var filePath = req.params[0];

				new Promise(function(resolve, reject) {
					resolve(
						siteService.retrieveSiteShortcutLink(username, siteName, filePath)
							.then(function(shortcutUrl) {
								res.redirect(shortcutUrl);
							})
					);
				})
				.catch(function(error) {
					next(error);
				});
			}

			function renderTemplate(res, themeId, templateId, context, next) {
				res.format({
					'text/html': function() {
						Promise.resolve(
							themeService.renderThemeTemplate(themeId, templateId, context)
						)
						.then(function(output) {
							res.send(output);
						})
						.catch(function(error) {
							next(error);
						});
					},
					'application/json': function() {
						res.json(context);
					}
				});
			}
		}

		function ensurePreviousUserLoggedOut(req) {
			var isPreviousUserLoggedIn = req.isAuthenticated();
			if (!isPreviousUserLoggedIn) { return Promise.resolve(); }
			return new Promise(function(resolve, reject) {
				req.logout();
				var passportSession = req.session.passport;
				req.session.regenerate(function(error) {
					if (error) { return reject(error); }
					req.session.passport = passportSession;
					resolve();
				});
			});
		}

		function getCustomizedSiteTheme(siteModel, themeIdOverride, themeConfigOverrides) {
			var siteTheme = siteModel.theme;
			if (!themeIdOverride && !themeConfigOverrides) { return siteTheme; }
			var themeId = themeIdOverride || siteTheme.id;
			var themeHasChanged = themeId && (themeId !== siteTheme.id);
			var theme = themeService.getTheme(themeId);
			var themeConfigBase = (themeHasChanged ? theme.defaults : siteTheme.config);
			var themeConfig = merge({}, themeConfigBase, themeConfigOverrides);
			return {
				id: themeId,
				config: themeConfig
			};
		}
	}
};
