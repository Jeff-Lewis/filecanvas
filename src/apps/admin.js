'use strict';

var fs = require('fs');
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
	if (!defaultSiteTemplate) { throw new Error('Missing default site template'); }

	var app = express();
	var passport = new Passport();

	initAuth(app, passport, database, {
		appKey: appKey,
		appSecret: appSecret,
		loginCallbackUrl: loginCallbackUrl,
		registerCallbackUrl: registerCallbackUrl
	});
	initAssetsRoot(app, '/assets', {
		assetsRoot: path.resolve(__dirname, '../../templates/admin/assets')
	});
	initStaticPages(app, {
		'/terms': fs.readFileSync(path.resolve(__dirname, '../../templates/legal/terms/terms.html'), { encoding: 'utf8' }),
		'/privacy': fs.readFileSync(path.resolve(__dirname, '../../templates/legal/privacy/privacy.html'), { encoding: 'utf8' })
	});
	initRoutes(app, passport, database, {
		defaultSiteTemplate: defaultSiteTemplate,
		faqData: faqData
	});
	initErrorHandler(app, {
		template: 'error'
	});
	initViewEngine(app, {
		templatesPath: path.resolve(__dirname, '../../templates/admin')
	});

	return app;


	function initAssetsRoot(app, pathPrefix, options) {
		options = options || {};
		var assetsRoot = options.assetsRoot;

		app.use(pathPrefix, express.static(assetsRoot, {
			redirect: false
		}));
	}

	function initStaticPages(app, pages) {
		Object.keys(pages).forEach(function(path) {
			var file = pages[path];
			app.get(path, function(req, res) {
				res.send(file);
			});
		});
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
				var profileFirstName = profile._json.name_details.given_name;
				var profileLastName = profile._json.name_details.surname;
				var profileEmail = profile.emails[0].value;
				return loginUser(database, uid, accessToken, profileFirstName, profileLastName, profileEmail)
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
				var profileFirstName = profile._json.name_details.given_name;
				var profileLastName = profile._json.name_details.surname;
				var profileEmail = profile.emails[0].value;
				return registerUser(database, uid, accessToken, profileFirstName, profileLastName, profileEmail)
					.then(function(userModel) {
						callback(null, userModel);
					})
					.catch(function(error) {
						callback(error);
					});
			}
		));


		function loginUser(database, uid, accessToken, profileFirstName, profileLastName, profileEmail) {
			return loadUserModel(database, uid)
				.catch(function(error) {
					if (error.status === 404) {
						throw new HttpError(403, profileEmail + ' is not a registered user');
					}
					throw error;
				})
				.then(function(userModel) {
					var hasUpdatedAccessToken = accessToken !== userModel.token;
					var hasUpdatedProfileFirstName = profileFirstName !== userModel.profileFirstName;
					var hasUpdatedProfileLastName = profileLastName !== userModel.profileLastName;
					var hasUpdatedProfileEmail = profileEmail !== userModel.profileEmail;
					var hasUpdatedUserDetails = hasUpdatedAccessToken || hasUpdatedProfileFirstName || hasUpdatedProfileLastName || hasUpdatedProfileEmail;
					if (hasUpdatedUserDetails) {
						return updateUserDetails(database, uid, {
							token: accessToken,
							profileFirstName: profileFirstName,
							profileLastName: profileLastName,
							profileEmail: profileEmail
						})
							.then(function() {
								userModel.token = accessToken;
								userModel.profileFirstName = profileFirstName;
								userModel.profileLastName = profileLastName;
								userModel.profileEmail = profileEmail;
								return userModel;
							});
					} else {
						return userModel;
					}
				});


			function loadUserModel(database, uid) {
				var userService = new UserService(database);
				return userService.retrieveUser(uid);
			}

			function updateUserDetails(database, uid, updates) {
				var userService = new UserService(database);
				return userService.updateUser(uid, updates);
			}
		}

		function registerUser(database, uid, accessToken, firstName, lastName, email) {
			return createUserModel(database, uid, accessToken, firstName, lastName, email);


			function createUserModel(database, uid, accessToken, firstName, lastName, email) {
				var userService = new UserService(database);
				var fullName = firstName + ' ' + lastName;
				var username = slug(fullName, { lower: true });
				return userService.generateUniqueUsername(username)
					.then(function(username) {
						var userModel = {
							uid: uid,
							token: accessToken,
							username: username,
							firstName: firstName,
							lastName: lastName,
							email: email,
							profileFirstName: firstName,
							profileLastName: lastName,
							profileEmail: email,
							defaultSite: null
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
						webroot: (userModel ? urlService.getSubdomainUrl(userModel.username) : null),
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
						terms: '/terms',
						privacy: '/privacy'
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

			app.get('/profile', ensureAuth, initAdminSession, retrieveUserProfileRoute);
			app.put('/profile', ensureAuth, initAdminSession, updateUserProfileRoute);
			app.get('/account', ensureAuth, initAdminSession, retrieveUserAccountRoute);
			app.put('/account', ensureAuth, initAdminSession, updateUserAccountRoute);
			app.delete('/account', ensureAuth, initAdminSession, deleteUserAccountRoute);

			app.get('/sites', ensureAuth, initAdminSession, retrieveSitesRoute);
			app.post('/sites', ensureAuth, initAdminSession, createSiteRoute);
			app.get('/sites/:site', ensureAuth, initAdminSession, retrieveSiteRoute);
			app.put('/sites/:site', ensureAuth, initAdminSession, updateSiteRoute);
			app.delete('/sites/:site', ensureAuth, initAdminSession, deleteSiteRoute);

			app.get('/sites/:site/users', ensureAuth, initAdminSession, retrieveSiteUsersRoute);
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
				var username = req.user.username;
				var siteModels = res.locals.sites;
				var siteName = (siteModels.length > 0 ? siteModels[Math.floor(Math.random() * siteModels.length)].name : 'my-site');
				var faqs = replaceFaqPlaceholders(faqData, {
					username: username,
					sitename: siteName
				});
				var templateData = {
					title: 'FAQ',
					breadcrumb: [
						{
							link: '/faq',
							icon: 'info-circle',
							label: 'FAQ'
						}
					],
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
					breadcrumb: [
						{
							link: '/support',
							icon: 'question-circle',
							label: 'Support'
						}
					],
					content: null
				};
				renderAdminPage(req, res, 'support', templateData)
					.catch(function(error) {
						next(error);
					});
			}

			function retrieveUserProfileRoute(req, res, next) {
				var userModel = req.user;
				var templateData = {
					title: 'Your profile',
					breadcrumb: [
						{
							link: '/profile',
							icon: 'user',
							label: 'Your profile'
						}
					],
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
					'username': req.body.username,
					'firstName': req.body.firstName,
					'lastName': req.body.lastName,
					'email': req.body.email
				};
				updateUser(database, uid, updates)
					.then(function(userModel) {
						res.redirect(303, '/sites');
					})
					.catch(function(error) {
						next(error);
					});


				function updateUser(database, uid, updates) {
					var userService = new UserService(database);
					return userService.updateUser(uid, updates);
				}
			}

			function retrieveUserAccountRoute(req, res, next) {
				var userModel = req.user;
				var templateData = {
					title: 'Your account',
					breadcrumb: [
						{
							link: '/account',
							icon: 'user',
							label: 'Your account'
						}
					],
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
				if ('username' in req.body) { updates.username = req.body.username; }
				if ('firstName' in req.body) { updates.firstName = req.body.firstName; }
				if ('lastName' in req.body) { updates.lastName = req.body.lastName; }
				if ('email' in req.body) { updates.email = req.body.email; }
				if ('defaultSite' in req.body) { updates.defaultSite = req.body.defaultSite || null; }
				updateUser(database, uid, updates)
					.then(function(userModel) {
						res.redirect(303, '/account');
					})
					.catch(function(error) {
						next(error);
					});


				function updateUser(database, uid, updates) {
					var userService = new UserService(database);
					return userService.updateUser(uid, updates);
				}
			}

			function deleteUserAccountRoute(req, res, next) {
				var userModel = req.user;
				var uid = userModel.uid;
				deleteUser(database, uid)
					.then(function() {
						req.logout();
						req.session.destroy();
						res.redirect(303, '/');
					})
					.catch(function(error) {
						next(error);
					});


				function deleteUser(database, uid) {
					var userService = new UserService(database);
					return userService.deleteUser(uid);
				}
			}

			function retrieveSitesRoute(req, res, next) {
				var siteModel = {
					name: '',
					label: '',
					root: '',
					private: false,
					home: false,
					template: {
						name: defaultSiteTemplate,
						options: {
							title: ''
						}
					}
				};
				var templateData = {
					title: 'Site dashboard',
					breadcrumb: [
						{
							link: '/sites',
							icon: 'dashboard',
							label: 'Site dashboard'
						}
					],
					content: {
						sites: res.locals.sites,
						site: siteModel
					}
				};
				renderAdminPage(req, res, 'sites', templateData)
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
					'name': req.body.name,
					'label': req.body.label,
					'template': {
						'name': req.body.template,
						'options': {
							title: req.body['template.title']
						}
					},
					'root': req.body.root || null,
					'private': req.body.private === 'true',
					'cache': null
				};

				var isDefaultSite = (req.body.home === 'true');

				createSite(database, siteModel)
					.then(function(siteModel) {
						if (!isDefaultSite) { return siteModel; }
						return updateUserDefaultSiteName(database, uid, siteModel.name)
							.then(function() {
								return siteModel;
							});
					})
					.then(function(siteModel) {
						res.redirect(303, '/sites/' + siteModel.name);
					})
					.catch(function(error) {
						next(error);
					});


				function createSite(database, siteModel) {
					var siteService = new SiteService(database, {
						host: host,
						appKey: appKey,
						appSecret: appSecret,
						accessToken: accessToken
					});
					return siteService.createSite(siteModel);
				}

				function updateUserDefaultSiteName(database, uid, siteName) {
					var userService = new UserService(database);
					return userService.updateUserDefaultSiteName(uid, siteName);
				}
			}

			function retrieveSiteRoute(req, res, next) {
				var userModel = req.user;
				var uid = userModel.uid;
				var defaultSiteName = userModel.defaultSite;
				var accessToken = userModel.token;
				var siteName = req.params.site;
				var includeContents = false;
				var includeUsers = true;
				retrieveSite(database, uid, siteName, includeContents, includeUsers)
					.then(function(siteModel) {
						var isDefaultSite = (siteModel.name === defaultSiteName);
						siteModel.home = isDefaultSite;
						return siteModel;
					})
					.then(function(siteModel) {
						var templateData = {
							title: 'Site settings: ' + siteModel.label,
							breadcrumb: [
								{
									link: '/sites',
									icon: 'dashboard',
									label: 'Site dashboard'
								},
								{
									link: '/sites/' + siteName,
									icon: 'cog',
									label: siteModel.label
								}
							],
							content: {
								site: siteModel
							}
						};
						return renderAdminPage(req, res, 'sites/site', templateData);
					})
					.catch(function(error) {
						next(error);
					});


				function retrieveSite(database, uid, siteName, includeContents, includeUsers) {
					var siteService = new SiteService(database, {
						host: host,
						appKey: appKey,
						appSecret: appSecret,
						accessToken: accessToken
					});
					return siteService.retrieveSite(uid, siteName, includeContents, includeUsers);
				}
			}

			function updateSiteRoute(req, res, next) {
				var isPurgeRequest = (req.body._action === 'purge');
				if (isPurgeRequest) {
					return purgeSiteRoute(req, res, next);
				}
				var userModel = req.user;
				var uid = userModel.uid;
				var defaultSiteName = userModel.defaultSite;
				var accessToken = userModel.token;
				var siteName = req.params.site;

				var updates = {
					'user': uid
				};
				if (req.body.name) { updates.name = req.body.name; }
				if (req.body.label) { updates.label = req.body.label; }
				if (req.body.template) {
					updates.template = {
						'name': req.body.template,
						'options': {
							title: req.body['template.title']
						}
					};
				}
				if (req.body.root) { updates.root = req.body.root || null; }
				if (req.body.private) { updates.private = req.body.private === 'true'; }

				var isDefaultSite = (req.body.home === 'true');
				var updatedSiteName = 'name' in updates ? updates.name : null;
				updateSite(database, uid, accessToken, siteName, updates)
					.then(function() {
						var updatedDefaultSiteName = (isDefaultSite ? (updatedSiteName || siteName) : (defaultSiteName === siteName ? null : defaultSiteName));
						if (updatedDefaultSiteName === defaultSiteName) { return; }
						return updateUserDefaultSiteName(database, uid, updatedDefaultSiteName);
					})
					.then(function() {
						res.redirect(303, '/sites/' + (updatedSiteName || siteName));
					})
					.catch(function(error) {
						next(error);
					});


				function updateSite(database, uid, accessToken, siteName, updates) {
					var siteService = new SiteService(database, {
						host: host,
						appKey: appKey,
						appSecret: appSecret,
						accessToken: accessToken
					});
					return siteService.updateSite(uid, siteName, updates);
				}

				function updateUserDefaultSiteName(database, uid, siteName) {
					var userService = new UserService(database);
					return userService.updateUserDefaultSiteName(uid, siteName);
				}
			}

			function purgeSiteRoute(req, res, next) {
				var userModel = req.user;
				var uid = userModel.uid;
				var accessToken = userModel.token;
				var siteName = req.params.site;
				purgeSite(database, uid, accessToken, siteName)
					.then(function() {
						res.redirect(303, '/sites/' + siteName);
					})
					.catch(function(error) {
						next(error);
					});


				function purgeSite(database, uid, accessToken, siteName) {
					var cache = null;
					var siteService = new SiteService(database, {
						host: host,
						appKey: appKey,
						appSecret: appSecret,
						accessToken: accessToken
					});
					return siteService.updateSiteCache(uid, siteName, cache);
				}
			}

			function deleteSiteRoute(req, res, next) {
				var userModel = req.user;
				var uid = userModel.uid;
				var accessToken = userModel.token;
				var siteName = req.params.site;
				deleteSite(database, uid, siteName)
					.then(function(siteModel) {
						res.redirect(303, '/sites');
					})
					.catch(function(error) {
						next(error);
					});


				function deleteSite(database, uid, siteName) {
					var siteService = new SiteService(database, {
						host: host,
						appKey: appKey,
						appSecret: appSecret,
						accessToken: accessToken
					});
					return siteService.deleteSite(uid, siteName);
				}
			}

			function retrieveSiteUsersRoute(req, res, next) {
				var userModel = req.user;
				var uid = userModel.uid;
				var accessToken = userModel.token;
				var siteName = req.params.site;
				var includeContents = false;
				var includeUsers = true;
				retrieveSite(database, uid, siteName, includeContents, includeUsers)
					.then(function(siteModel) {
						var templateData = {
							title: 'Edit site users: ' + siteModel.label,
							breadcrumb: [
								{
									link: '/sites',
									icon: 'dashboard',
									label: 'Site dashboard'
								},
								{
									link: '/sites/' + siteName,
									icon: 'cog',
									label: siteModel.label
								},
								{
									link: '/sites/' + siteName + '/users',
									icon: 'users',
									label: 'Site users'
								}
							],
							content: {
								site: siteModel
							}
						};
						return renderAdminPage(req, res, 'sites/site/users', templateData);
					})
					.catch(function(error) {
						next(error);
					});


				function retrieveSite(database, uid, siteName, includeContents, includeUsers) {
					var siteService = new SiteService(database, {
						host: host,
						appKey: appKey,
						appSecret: appSecret,
						accessToken: accessToken
					});
					return siteService.retrieveSite(uid, siteName, includeContents, includeUsers);
				}
			}

			function createSiteUserRoute(req, res, next) {
				var userModel = req.user;
				var uid = userModel.uid;
				var accessToken = userModel.token;
				var siteName = req.params.site;
				var username = req.body.username;
				var password = req.body.password;
				createSiteUser(database, uid, siteName, {
					username: username,
					password: password
				})
					.then(function(userModel) {
						res.redirect(303, '/sites/' + siteName + '/users');
					})
					.catch(function(error) {
						next(error);
					});


				function createSiteUser(database, uid, siteName, authDetails) {
					var siteService = new SiteService(database, {
						host: host,
						appKey: appKey,
						appSecret: appSecret,
						accessToken: accessToken
					});
					return siteService.createSiteUser(uid, siteName, authDetails);
				}
			}

			function updateSiteUserRoute(req, res, next) {
				var userModel = req.user;
				var uid = userModel.uid;
				var accessToken = userModel.token;
				var siteName = req.params.site;
				var username = req.params.username;
				var password = req.body.password;
				updateSiteUser(database, uid, siteName, username, {
					username: username,
					password: password
				})
					.then(function(userModel) {
						res.redirect(303, '/sites/' + siteName + '/users');
					})
					.catch(function(error) {
						next(error);
					});


				function updateSiteUser(database, uid, siteName, username, authDetails) {
					var siteService = new SiteService(database, {
						host: host,
						appKey: appKey,
						appSecret: appSecret,
						accessToken: accessToken
					});
					return siteService.updateSiteUser(uid, siteName, username, authDetails);
				}
			}

			function deleteSiteUserRoute(req, res, next) {
				var userModel = req.user;
				var uid = userModel.uid;
				var accessToken = userModel.token;
				var siteName = req.params.site;
				var username = req.params.username;
				deleteSiteUser(database, uid, siteName, username)
					.then(function() {
						res.redirect(303, '/sites/' + siteName + '/users');
					})
					.catch(function(error) {
						next(error);
					});


				function deleteSiteUser(database, uid, siteName, username) {
					var siteService = new SiteService(database, {
						host: host,
						appKey: appKey,
						appSecret: appSecret,
						accessToken: accessToken
					});
					return siteService.deleteSiteUser(uid, siteName, username);
				}
			}

			function retrieveDropboxMetadataRoute(req, res, next) {
				var userModel = req.user;
				var uid = userModel.uid;
				var accessToken = userModel.token;
				var dropboxPath = req.params[0];
				getDropboxFileMetadata(database, uid, dropboxPath)
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


				function getDropboxFileMetadata(database, uid, dropboxPath) {
					var siteService = new SiteService(database, {
						host: host,
						appKey: appKey,
						appSecret: appSecret,
						accessToken: accessToken
					});
					return siteService.getDropboxFileMetadata(uid, dropboxPath);
				}
			}
		}
	}
};
