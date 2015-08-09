'use strict';

var path = require('path');
var objectAssign = require('object-assign');
var express = require('express');
var Passport = require('passport').Passport;
var DropboxOAuth2Strategy = require('passport-dropbox-oauth2').Strategy;
var slug = require('slug');

var transport = require('../middleware/transport');
var invalidRoute = require('../middleware/invalidRoute');
var errorHandler = require('../middleware/errorHandler');
var handlebarsEngine = require('../engines/handlebars');

var HttpError = require('../errors/HttpError');

var SiteService = require('../services/SiteService');
var UrlService = require('../services/UrlService');
var UserService = require('../services/UserService');

var faqData = require('../../templates/admin/faq.json');

module.exports = function(database, options) {
	options = options || {};
	var host = options.host;
	var appKey = options.appKey;
	var appSecret = options.appSecret;
	var loginCallbackUrl = options.loginCallbackUrl;
	var registerCallbackUrl = options.registerCallbackUrl;
	var defaultSiteTemplate = options.defaultSiteTemplate;

	if (!host) { throw new Error('Missing hostname'); }
	if (!appKey) { throw new Error('Missing Dropbox app key'); }
	if (!appSecret) { throw new Error('Missing Dropbox app secret'); }
	if (!loginCallbackUrl) { throw new Error('Missing Dropbox login callback URL'); }
	if (!registerCallbackUrl) { throw new Error('Missing Dropbox register callback URL'); }
	if (!defaultSiteTemplate) { throw new Error('Missing default site template name'); }

	var app = express();
	var passport = new Passport();

	initStaticAssets(app, {
		assetsRoot: path.resolve(__dirname, '../../templates/admin/assets')
	});
	initAuth(app, passport, database, {
		appKey: appKey,
		appSecret: appSecret,
		loginCallbackUrl: loginCallbackUrl,
		registerCallbackUrl: registerCallbackUrl
	});
	initViewEngine(app, {
		templatesPath: path.resolve(__dirname, '../../templates/admin')
	});
	initRoutes(app, passport, database, {
		defaultSiteTemplate: defaultSiteTemplate,
		faqData: faqData
	});
	initErrorHandler(app, {
		template: 'error'
	});

	return app;


	function initStaticAssets(app, options) {
		options = options || {};
		var assetsRoot = options.assetsRoot;

		app.use('/assets', express.static(assetsRoot));
	}

	function initAuth(app, passport, database, options) {
		options = options || {};
		var appKey = options.appKey;
		var appSecret = options.appSecret;
		var loginCallbackUrl = options.loginCallbackUrl;
		var registerCallbackUrl = options.registerCallbackUrl;

		app.use(transport());
		app.use(passport.initialize());
		app.use(passport.session());

		passport.serializeUser(function(userModel, callback) {
			var uid = userModel.uid;
			return callback && callback(null, uid);
		});

		passport.deserializeUser(function(uid, callback) {
			var userService = new UserService(database);
			return userService.retrieveUser(uid)
				.then(function(userModel) {
					return callback(null, userModel);
				})
				.catch(function(error) {
					return callback(error);
				});
		});

		passport.use('admin/dropbox', new DropboxOAuth2Strategy(
			{
				clientID: appKey,
				clientSecret: appSecret,
				callbackURL: loginCallbackUrl
			},
			function(accessToken, refreshToken, profile, callback) {
				var uid = profile.id;
				var profileName = profile.displayName;
				var profileEmail = profile.emails[0].value;
				return loginUser(database, uid, accessToken, profileName, profileEmail)
					.then(function(userModel) {
						callback(null, userModel);
					})
					.catch(function(error) {
						callback(error);
					});
			}
		));

		passport.use('admin/register', new DropboxOAuth2Strategy(
			{
				clientID: appKey,
				clientSecret: appSecret,
				callbackURL: registerCallbackUrl
			},
			function(accessToken, refreshToken, profile, callback) {
				var uid = profile.id;
				var profileName = profile.displayName;
				var profileEmail = profile.emails[0].value;
				return registerUser(database, uid, accessToken, profileName, profileEmail)
					.then(function(userModel) {
						callback(null, userModel);
					})
					.catch(function(error) {
						callback(error);
					});
			}
		));


		function loginUser(database, uid, accessToken, profileName, profileEmail) {
			return loadUserModel(database, uid, accessToken, profileName, profileEmail)
				.catch(function(error) {
					if (error.status === 404) {
						throw new HttpError(403, profileEmail + ' is not a registered user');
					}
					throw error;
				})
				.then(function(userModel) {
					var hasUpdatedAccessToken = accessToken !== userModel.token;
					var hasUpdatedProfileName = profileName !== userModel.profileName;
					var hasUpdatedProfileEmail = profileEmail !== userModel.profileEmail;
					var hasUpdatedUserDetails = hasUpdatedAccessToken || hasUpdatedProfileName || hasUpdatedProfileEmail;
					if (hasUpdatedUserDetails) {
						return updateUserDetails(database, uid, {
							token: accessToken,
							profileName: profileName,
							profileEmail: profileEmail
						})
							.then(function() {
								userModel.token = accessToken;
								userModel.profileName = profileName;
								userModel.profileEmail = profileEmail;
								return userModel;
							});
					}
					return userModel;
				});


			function loadUserModel(database, uid, accessToken, name, email) {
				var userService = new UserService(database);
				return userService.retrieveUser(uid);
			}

			function updateUserDetails(database, uid, updates) {
				var userService = new UserService(database);
				return userService.updateUser(uid, updates);
			}
		}

		function registerUser(database, uid, accessToken, profileName, profileEmail) {
			return createUserModel(database, uid, accessToken, profileName, profileEmail);


			function createUserModel(database, uid, accessToken, name, email) {
				var userService = new UserService(database);
				var alias = slug(name, { lower: true });
				return userService.generateUniqueAlias(alias)
					.then(function(alias) {
						var userModel = {
							uid: uid,
							token: accessToken,
							alias: alias,
							name: name,
							email: email,
							profileName: name,
							profileEmail: email,
							default: null
						};
						return userService.createUser(userModel);
					});
			}
		}
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
		var defaultSiteTemplate = options.defaultSiteTemplate;
		var faqData = options.faqData;

		initPublicRoutes(app, passport);
		initPrivateRoutes(app, passport, defaultSiteTemplate, faqData);
		app.use(invalidRoute());


		function initAdminSession(req, res, next) {
			loadSessionData(req)
				.then(function(sessionData) {
					Object.keys(sessionData).forEach(function(key) {
						res.locals[key] = sessionData[key];
					});
					next();
				})
				.catch(function(error) {
					next(error);
				});


			function loadSessionData(req) {
				var userModel = req.user || null;
				return Promise.resolve(userModel ? getUserSites(database, userModel) : null)
					.then(function(siteModels) {
						var urlService = new UrlService(req);
						var adminUrls = getAdminUrls(urlService, userModel);
						return {
							urls: adminUrls,
							location: urlService.location,
							sites: siteModels
						};
					});


				function getUserSites(database, userModel) {
					var uid = userModel.uid;
					var userService = new UserService(database);
					return userService.retrieveUserSites(uid);
				}

				function getAdminUrls(urlService, userModel) {
					return {
						webroot: (userModel ? urlService.getSubdomainUrl(userModel.alias) : null),
						domain: urlService.getSubdomainUrl('$0'),
						admin: '/',
						faq: '/faq',
						support: '/support',
						account: '/account',
						profile: '/profile',
						login: '/login',
						loginAuth: '/login/oauth2',
						registerAuth: '/register/oauth2',
						logout: '/logout',
						sites: '/sites',
						sitesAdd: '/sites/create'
					};
				}
			}
		}

		function renderAdminPage(req, res, templateName, context) {
			return new Promise(function(resolve, reject) {
				var templateData = getTemplateData(req, res, context);
				res.render(templateName, templateData, function(error, pageContent) {
					if (error) { return reject(error); }
					var templateOptions = {
						partials: {
							'page': pageContent
						}
					};
					var templateData = getTemplateData(req, res, context, templateOptions);
					res.render('index', templateData, function(error, data) {
						if (error) { return reject(error); }
						res.send(data);
						resolve(data);
					});
				});
			});


			function getTemplateData(req, res, context, templateOptions) {
				templateOptions = templateOptions || null;
				var templateData = {
					_: templateOptions,
					session: getTemplateSessionData(req, res)
				};
				return objectAssign({}, context, templateData);
			}

			function getTemplateSessionData(req, res) {
				var session = {
					user: req.user || null
				};
				return objectAssign({}, res.locals, session);
			}
		}

		function initPublicRoutes(app, passport) {
			app.get('/login', redirectIfLoggedIn, initAdminSession, retrieveLoginRoute);
			app.get('/logout', initAdminSession, retrieveLogoutRoute);
			app.get('/login/oauth2', passport.authenticate('admin/dropbox'));
			app.get('/login/oauth2/callback', passport.authenticate('admin/dropbox', { failureRedirect: '/login' }), onLoggedIn);
			app.get('/register/oauth2', passport.authenticate('admin/register'));
			app.get('/register/oauth2/callback', passport.authenticate('admin/register', { failureRedirect: '/login' }), onRegistered);


			function onLoggedIn(req, res) {
				if (req.session.loginRedirect) {
					var redirectUrl = req.session.loginRedirect;
					delete req.session.loginRedirect;
					res.redirect(redirectUrl);
				} else {
					res.redirect('/');
				}
			}

			function onRegistered(req, res) {
				if (req.session.loginRedirect) {
					var redirectUrl = req.session.loginRedirect;
					delete req.session.loginRedirect;
					res.redirect(redirectUrl);
				} else {
					res.redirect('/profile');
				}
			}

			function redirectIfLoggedIn(req, res, next) {
				if (!req.isAuthenticated()) {
					return next();
				}
				res.redirect('/');
			}

			function retrieveLoginRoute(req, res, next) {
				var templateData = {
					title: 'Login',
					content: null
				};
				renderAdminPage(req, res, 'login', templateData)
					.catch(function(error) {
						next(error);
					});
			}

			function retrieveLogoutRoute(req, res, next) {
				req.logout();
				req.session.destroy();
				res.redirect('/');
			}
		}

		function initPrivateRoutes(app, passport, defaultSiteTemplate, faqData) {
			app.get('/', ensureAuth, initAdminSession, retrieveHomeRoute);
			app.get('/faq', ensureAuth, initAdminSession, retrieveFaqRoute);
			app.get('/support', ensureAuth, initAdminSession, retrieveSupportRoute);
			app.get('/account', ensureAuth, initAdminSession, retrieveUserAccountRoute);
			app.put('/account', ensureAuth, initAdminSession, updateUserAccountRoute);
			app.delete('/account', ensureAuth, initAdminSession, deleteUserAccountRoute);
			app.get('/profile', ensureAuth, initAdminSession, retrieveUserProfileRoute);
			app.put('/profile', ensureAuth, initAdminSession, updateUserProfileRoute);
			app.get('/sites', ensureAuth, initAdminSession, retrieveSitesRoute);
			app.get('/sites/create', ensureAuth, initAdminSession, retrieveSiteCreateRoute);
			app.get('/sites/:site/settings', ensureAuth, initAdminSession, retrieveSiteSettingsRoute);
			app.get('/sites/:site/users', ensureAuth, initAdminSession, retrieveSiteUsersRoute);
			app.post('/sites', ensureAuth, initAdminSession, createSiteRoute);
			app.put('/sites/:site', ensureAuth, initAdminSession, updateSiteRoute);
			app.delete('/sites/:site', ensureAuth, initAdminSession, deleteSiteRoute);
			app.post('/sites/:site/users', ensureAuth, initAdminSession, createSiteUserRoute);
			app.put('/sites/:site/users/:username', ensureAuth, initAdminSession, updateSiteUserRoute);
			app.delete('/sites/:site/users/:username', ensureAuth, initAdminSession, deleteSiteUserRoute);

			app.get('/dropbox/metadata/*', ensureAuth, initAdminSession, retrieveDropboxMetadataRoute);


			function ensureAuth(req, res, next) {
				if (!req.isAuthenticated()) {
					var redirectUrl = (req.originalUrl === '/' ? null : req.originalUrl);
					if (redirectUrl) { req.session.loginRedirect = redirectUrl; }
					res.redirect('/login');
					return;
				}
				next();
			}

			function retrieveHomeRoute(req, res, next) {
				res.redirect('/sites');
			}

			function retrieveFaqRoute(req, res, next) {
				var username = req.user.alias;
				var siteModels = res.locals.sites;
				var siteAlias = (siteModels.length > 0 ? siteModels[Math.floor(Math.random() * siteModels.length)].alias : 'site-name');
				var faqs = replaceFaqPlaceholders(faqData, {
					username: username,
					sitename: siteAlias
				});
				var templateData = {
					title: 'FAQ',
					content: {
						questions: faqs
					}
				};
				renderAdminPage(req, res, 'faq', templateData)
					.catch(function(error) {
						next(error);
					});


				function replaceFaqPlaceholders(faqData, options) {
					var username = options.username;
					var sitename = options.sitename;
					return JSON.parse(JSON.stringify(faqData)
						.replace(/\$\{username\}/g, username)
						.replace(/\$\{sitename\}/g, sitename)
					);
				}
			}

			function retrieveSupportRoute(req, res, next) {
				var templateData = {
					title: 'Support',
					content: null
				};
				renderAdminPage(req, res, 'support', templateData)
					.catch(function(error) {
						next(error);
					});
			}

			function retrieveUserAccountRoute(req, res, next) {
				var userModel = req.user;
				var templateData = {
					title: 'Your account',
					content: {
						user: userModel
					}
				};
				return renderAdminPage(req, res, 'account', templateData);
			}

			function updateUserAccountRoute(req, res, next) {
				var userModel = req.user;
				var uid = userModel.uid;
				var updates = {};
				if ('alias' in req.body) { updates.alias = req.body.alias; }
				if ('name' in req.body) { updates.name = req.body.name; }
				if ('email' in req.body) { updates.email = req.body.email; }
				if ('default' in req.body) { updates.default = req.body.default || null; }
				var userService = new UserService(database);
				userService.updateUser(uid, updates)
					.then(function(userModel) {
						res.redirect(303, '/account');
					})
					.catch(function(error) {
						next(error);
					});
			}

			function deleteUserAccountRoute(req, res, next) {
				var userModel = req.user;
				var uid = userModel.uid;

				var userService = new UserService(database);
				userService.deleteUser(uid)
					.then(function(siteModel) {
						req.logout();
						req.session.destroy();
						res.redirect(303, '/');
					})
					.catch(function(error) {
						next(error);
					});
			}

			function retrieveUserProfileRoute(req, res, next) {
				var userModel = req.user;
				var templateData = {
					title: 'Your profile',
					content: {
						user: userModel
					}
				};
				return renderAdminPage(req, res, 'profile', templateData);
			}

			function updateUserProfileRoute(req, res, next) {
				var userModel = req.user;
				var uid = userModel.uid;
				var updates = {
					'alias': req.body.alias,
					'name': req.body.name,
					'email': req.body.email
				};
				var userService = new UserService(database);
				userService.updateUser(uid, updates)
					.then(function(userModel) {
						res.redirect(303, '/sites');
					})
					.catch(function(error) {
						next(error);
					});
			}

			function retrieveSitesRoute(req, res, next) {
				var templateData = {
					title: 'Your sites',
					content: {
						sites: res.locals.sites
					}
				};
				renderAdminPage(req, res, 'sites', templateData)
					.catch(function(error) {
						next(error);
					});
			}

			function retrieveSiteCreateRoute(req, res, next) {
				var siteModel = {
					template: defaultSiteTemplate
				};
				var templateData = {
					title: 'Create a site',
					content: {
						site: siteModel
					}
				};
				renderAdminPage(req, res, 'sites/create', templateData)
					.catch(function(error) {
						next(error);
					});
			}

			function retrieveSiteSettingsRoute(req, res, next) {
				var userModel = req.user;
				var uid = userModel.uid;
				var accessToken = userModel.token;
				var siteAlias = req.params.site;

				var siteService = new SiteService(database, {
					host: host,
					appKey: appKey,
					appSecret: appSecret,
					accessToken: accessToken
				});
				var includeContents = false;
				var includeUsers = true;
				siteService.retrieveSite(uid, siteAlias, includeContents, includeUsers)
					.then(function(siteModel) {
						var templateData = {
							title: 'Site settings: ' + siteModel.name,
							content: {
								site: siteModel
							}
						};
						return renderAdminPage(req, res, 'sites/settings', templateData);
					})
					.catch(function(error) {
						next(error);
					});
			}

			function retrieveSiteUsersRoute(req, res, next) {
				var userModel = req.user;
				var uid = userModel.uid;
				var accessToken = userModel.token;
				var siteAlias = req.params.site;

				var siteService = new SiteService(database, {
					host: host,
					appKey: appKey,
					appSecret: appSecret,
					accessToken: accessToken
				});
				var includeContents = false;
				var includeUsers = true;
				siteService.retrieveSite(uid, siteAlias, includeContents, includeUsers)
					.then(function(siteModel) {
						var templateData = {
							title: 'Edit site users: ' + siteModel.name,
							content: {
								site: siteModel
							}
						};
						return renderAdminPage(req, res, 'sites/users', templateData);
					})
					.catch(function(error) {
						next(error);
					});
			}

			function createSiteRoute(req, res, next) {
				var userModel = req.user;
				var uid = userModel.uid;
				var accessToken = userModel.token;

				var siteModel = {
					'user': uid,
					'alias': req.body.alias,
					'name': req.body.name,
					'title': req.body.title,
					'template': req.body.template,
					'path': req.body.path || null,
					'private': req.body.private === 'true'
				};

				var siteService = new SiteService(database, {
					host: host,
					appKey: appKey,
					appSecret: appSecret,
					accessToken: accessToken
				});
				siteService.createSite(siteModel)
					.then(function(siteModel) {
						res.redirect(303, '/sites/' + siteModel.alias + '/settings');
					})
					.catch(function(error) {
						next(error);
					});
			}

			function updateSiteRoute(req, res, next) {
				var userModel = req.user;
				var uid = userModel.uid;
				var accessToken = userModel.token;
				var siteAlias = req.params.site;

				var isPurgeRequest = (req.body._action === 'purge');
				if (isPurgeRequest) {
					purgeSite(uid, accessToken, siteAlias)
						.then(function() {
							res.redirect(303, '/sites/' + siteAlias + '/settings');
						})
						.catch(function(error) {
							next(error);
						});
				} else {

					var updates = {
						'user': uid
					};
					if (req.body.alias) { updates.alias = req.body.alias; }
					if (req.body.name) { updates.name = req.body.name; }
					if (req.body.title) { updates.title = req.body.title; }
					if (req.body.template) { updates.template = req.body.template; }
					if (req.body.path) { updates.path = req.body.path || null; }
					if (req.body.private) { updates.private = req.body.private === 'true'; }
					updateSite(uid, accessToken, siteAlias, updates)
						.then(function() {
							if ('alias' in updates) { siteAlias = updates.alias; }
							res.redirect(303, '/sites/' + siteAlias + '/settings');
						})
						.catch(function(error) {
							next(error);
						});
				}


				function purgeSite(uid, accessToken, siteAlias) {
					var cache = null;
					var siteService = new SiteService(database, {
						host: host,
						appKey: appKey,
						appSecret: appSecret,
						accessToken: accessToken
					});
					return siteService.updateSiteCache(uid, siteAlias, cache);
				}

				function updateSite(uid, accessToken, siteAlias, updates) {
					var siteService = new SiteService(database, {
						host: host,
						appKey: appKey,
						appSecret: appSecret,
						accessToken: accessToken
					});
					return siteService.updateSite(uid, siteAlias, updates);
				}
			}

			function deleteSiteRoute(req, res, next) {
				var userModel = req.user;
				var uid = userModel.uid;
				var accessToken = userModel.token;
				var siteAlias = req.params.site;

				var siteService = new SiteService(database, {
					host: host,
					appKey: appKey,
					appSecret: appSecret,
					accessToken: accessToken
				});
				siteService.deleteSite(uid, siteAlias)
					.then(function(siteModel) {
						res.redirect(303, '/sites');
					})
					.catch(function(error) {
						next(error);
					});
			}

			function createSiteUserRoute(req, res, next) {
				var userModel = req.user;
				var uid = userModel.uid;
				var accessToken = userModel.token;
				var siteAlias = req.params.site;
				var username = req.body.username;
				var password = req.body.password;

				var siteService = new SiteService(database, {
					host: host,
					appKey: appKey,
					appSecret: appSecret,
					accessToken: accessToken
				});
				siteService.createSiteUser(uid, siteAlias, {
					username: username,
					password: password
				})
					.then(function(userModel) {
						res.redirect(303, '/sites/' + siteAlias + '/users');
					})
					.catch(function(error) {
						next(error);
					});
			}

			function updateSiteUserRoute(req, res, next) {
				var userModel = req.user;
				var uid = userModel.uid;
				var accessToken = userModel.token;
				var siteAlias = req.params.site;
				var username = req.params.username;
				var password = req.body.password;

				var siteService = new SiteService(database, {
					host: host,
					appKey: appKey,
					appSecret: appSecret,
					accessToken: accessToken
				});
				siteService.updateSiteUser(uid, siteAlias, username, {
					username: username,
					password: password
				})
					.then(function(userModel) {
						res.redirect(303, '/sites/' + siteAlias + '/users');
					})
					.catch(function(error) {
						next(error);
					});
			}

			function deleteSiteUserRoute(req, res, next) {
				var userModel = req.user;
				var uid = userModel.uid;
				var accessToken = userModel.token;
				var siteAlias = req.params.site;
				var username = req.params.username;

				var siteService = new SiteService(database, {
					host: host,
					appKey: appKey,
					appSecret: appSecret,
					accessToken: accessToken
				});
				siteService.deleteSiteUser(uid, siteAlias, username)
					.then(function() {
						res.redirect(303, '/sites/' + siteAlias + '/users');
					})
					.catch(function(error) {
						next(error);
					});
			}

			function retrieveDropboxMetadataRoute(req, res, next) {
				var userModel = req.user;
				var uid = userModel.uid;
				var accessToken = userModel.token;
				var dropboxPath = req.params[0];

				var siteService = new SiteService(database, {
					host: host,
					appKey: appKey,
					appSecret: appSecret,
					accessToken: accessToken
				});
				siteService.getDropboxFileMetadata(uid, dropboxPath)
					.then(function(metadata) {
						res.json(metadata);
					})
					.catch(function(error) {
						if (error.status === 404) {
							res.json(null);
							return;
						}
						next(error);
					});
			}
		}
	}
};
