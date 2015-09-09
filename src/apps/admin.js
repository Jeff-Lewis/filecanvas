'use strict';

var fs = require('fs');
var path = require('path');
var objectAssign = require('object-assign');
var express = require('express');
var Passport = require('passport').Passport;
var DropboxOAuth2Strategy = require('passport-dropbox-oauth2').Strategy;
var slug = require('slug');

var sitesApp = require('./sites');

var transport = require('../middleware/transport');
var invalidRoute = require('../middleware/invalidRoute');
var errorHandler = require('../middleware/errorHandler');
var handlebarsEngine = require('../engines/handlebars');

var HttpError = require('../errors/HttpError');

var SiteService = require('../services/SiteService');
var UrlService = require('../services/UrlService');
var UserService = require('../services/UserService');

var faqData = require('../../templates/admin/faq.json');

var THEME_MANIFEST_FILENAME = 'theme.json';

module.exports = function(database, options) {
	options = options || {};
	var host = options.host;
	var appKey = options.appKey;
	var appSecret = options.appSecret;
	var loginCallbackUrl = options.loginCallbackUrl;
	var registerCallbackUrl = options.registerCallbackUrl;
	var themesPath = options.themesPath;
	var themesUrl = options.themesUrl;
	var defaultSiteTheme = options.defaultSiteTheme;

	if (!host) { throw new Error('Missing hostname'); }
	if (!appKey) { throw new Error('Missing Dropbox app key'); }
	if (!appSecret) { throw new Error('Missing Dropbox app secret'); }
	if (!loginCallbackUrl) { throw new Error('Missing Dropbox login callback URL'); }
	if (!registerCallbackUrl) { throw new Error('Missing Dropbox register callback URL'); }
	if (!themesPath) { throw new Error('Missing site themes path'); }
	if (!defaultSiteTheme) { throw new Error('Missing default site theme'); }
	if (!themesUrl) { throw new Error('Missing themes root URL'); }

	var app = express();
	var passport = new Passport();

	var themes = loadThemes(themesPath);
	var defaultTheme = themes[defaultSiteTheme];

	initAuth(app, passport, database, {
		appKey: appKey,
		appSecret: appSecret,
		loginCallbackUrl: loginCallbackUrl,
		registerCallbackUrl: registerCallbackUrl
	});
	initAssetsRoot(app, '/assets', {
		assetsRoot: path.resolve(__dirname, '../../templates/admin') + '/assets'
	});
	initStaticPages(app, {
		'/terms': fs.readFileSync(path.resolve(__dirname, '../../templates/legal/terms/terms.html'), { encoding: 'utf8' }),
		'/privacy': fs.readFileSync(path.resolve(__dirname, '../../templates/legal/privacy/privacy.html'), { encoding: 'utf8' })
	});
	initRoutes(app, passport, database, {
		themes: themes,
		defaultTheme: defaultTheme,
		themesUrl: themesUrl,
		faqData: faqData
	});
	initErrorHandler(app, {
		template: 'error'
	});
	initViewEngine(app, {
		templatesPath: path.resolve(__dirname, '../../templates/admin')
	});

	return app;


	function loadThemes(themesPath) {
		var filenames = fs.readdirSync(themesPath)
			.filter(function(filename) {
				return filename.charAt(0) !== '.';
			});
		var themes = filenames.reduce(function(themes, filename) {
			var themeManifestPath = path.join(themesPath, filename, THEME_MANIFEST_FILENAME);
			var theme = require(themeManifestPath);
			theme.id = filename;
			theme.defaults = parseThemeConfigDefaults(theme);
			themes[filename] = theme;
			return themes;
		}, {});
		return themes;


		function parseThemeConfigDefaults(theme) {
			var configSchema = theme.config;
			return configSchema.reduce(function(defaults, configGroup) {
				var configGroupDefaults = parseConfigGroupDefaults(configGroup);
				defaults[configGroup.name] = configGroupDefaults;
				return defaults;
			}, {});

			function parseConfigGroupDefaults(configGroup) {
				var configGroupFields = configGroup.fields;
				return configGroupFields.reduce(function(defaults, field) {
					defaults[field.name] = field.default;
					return defaults;
				}, {});
			}
		}
	}

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
				var dropboxFirstName = profile._json.name_details.given_name;
				var dropboxLastName = profile._json.name_details.surname;
				var dropboxEmail = profile.emails[0].value;
				return loginUser(uid, accessToken, dropboxFirstName, dropboxLastName, dropboxEmail)
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
				var dropboxFirstName = profile._json.name_details.given_name;
				var dropboxLastName = profile._json.name_details.surname;
				var dropboxEmail = profile.emails[0].value;
				return registerUser(uid, accessToken, dropboxFirstName, dropboxLastName, dropboxEmail)
					.then(function(userModel) {
						callback(null, userModel);
					})
					.catch(function(error) {
						callback(error);
					});
			}
		));


		function loginUser(uid, accessToken, dropboxFirstName, dropboxLastName, dropboxEmail) {
			return loadUserModel(uid)
				.catch(function(error) {
					if (error.status === 404) {
						throw new HttpError(403, dropboxEmail + ' is not a registered user');
					}
					throw error;
				})
				.then(function(userModel) {
					var hasUpdatedAccessToken = accessToken !== userModel.token;
					var hasUpdatedProfileFirstName = dropboxFirstName !== userModel.dropboxFirstName;
					var hasUpdatedProfileLastName = dropboxLastName !== userModel.dropboxLastName;
					var hasUpdatedProfileEmail = dropboxEmail !== userModel.dropboxEmail;
					var hasUpdatedUserDetails = hasUpdatedAccessToken || hasUpdatedProfileFirstName || hasUpdatedProfileLastName || hasUpdatedProfileEmail;
					if (hasUpdatedUserDetails) {
						return updateUserDetails(uid, {
							token: accessToken,
							dropboxFirstName: dropboxFirstName,
							dropboxLastName: dropboxLastName,
							dropboxEmail: dropboxEmail
						})
							.then(function() {
								userModel.token = accessToken;
								userModel.dropboxFirstName = dropboxFirstName;
								userModel.dropboxLastName = dropboxLastName;
								userModel.dropboxEmail = dropboxEmail;
								return userModel;
							});
					} else {
						return userModel;
					}
				});
		}

		function registerUser(uid, accessToken, firstName, lastName, email) {
			var fullName = firstName + ' ' + lastName;
			var username = slug(fullName, { lower: true });
			return generateUniqueUsername(username)
				.then(function(username) {
					var userModel = {
						uid: uid,
						token: accessToken,
						username: username,
						firstName: firstName,
						lastName: lastName,
						email: email,
						dropboxFirstName: firstName,
						dropboxLastName: lastName,
						dropboxEmail: email,
						defaultSite: null
					};
					return createUser(userModel);
				});
		}

		function loadUserModel(uid) {
			var userService = new UserService(database);
			return userService.retrieveUser(uid);
		}

		function updateUserDetails(uid, updates) {
			var userService = new UserService(database);
			return userService.updateUser(uid, updates);
		}

		function generateUniqueUsername(username) {
			var userService = new UserService(database);
			return userService.generateUniqueUsername(username);
		}

		function createUser(userModel) {
			var userService = new UserService(database);
			return userService.createUser(userModel);
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
		var themes = options.themes;
		var defaultTheme = options.defaultTheme;
		var themesUrl = options.themesUrl;
		var faqData = options.faqData;

		initPublicRoutes(app, passport);
		initPrivateRoutes(app, passport, themes, defaultTheme, themesUrl, faqData);
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
				return Promise.resolve(userModel ? retrieveUserSites(userModel.uid) : null)
					.then(function(siteModels) {
						if (!siteModels) { return null; }
						var defaultSiteName = userModel.defaultSite;
						return getSortedSiteModels(siteModels, defaultSiteName);
					})
					.then(function(sortedSiteModels) {
						var urlService = new UrlService(req);
						var adminUrls = getAdminUrls(urlService, userModel);
						return {
							urls: adminUrls,
							location: urlService.location,
							sites: sortedSiteModels
						};
					});


				function getSortedSiteModels(siteModels, defaultSiteName) {
					return siteModels.slice().sort(function(item1, item2) {
						if (item1.name === defaultSiteName) { return -1; }
						if (item2.name === defaultSiteName) { return 1; }
						return (item1.label < item2.label ? -1 : 1);
					});
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
						preview: '/preview',
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
					navigation: false,
					footer: true,
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

		function initPrivateRoutes(app, passport, themes, defaultTheme, themesUrl, faqData) {
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

			app.get('/sites/:site/theme', ensureAuth, initAdminSession, retrieveSiteThemeRoute);

			app.get('/dropbox/metadata/*', ensureAuth, initAdminSession, retrieveDropboxMetadataRoute);

			app.use('/preview', createPreviewApp(database, {
				host: host,
				appKey: appKey,
				appSecret: appSecret,
				themesUrl: themesUrl
			}));


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
					navigation: true,
					footer: true,
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
					navigation: true,
					footer: true,
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
					navigation: true,
					footer: true,
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
				updateUser(uid, updates)
					.then(function(userModel) {
						res.redirect(303, '/sites');
					})
					.catch(function(error) {
						next(error);
					});
			}

			function retrieveUserAccountRoute(req, res, next) {
				var userModel = req.user;
				var templateData = {
					title: 'Your account',
					navigation: true,
					footer: true,
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
				updateUser(uid, updates)
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
				deleteUser(uid)
					.then(function() {
						req.logout();
						req.session.destroy();
						res.redirect(303, '/');
					})
					.catch(function(error) {
						next(error);
					});
			}

			function retrieveSitesRoute(req, res, next) {
				var siteModel = {
					name: '',
					label: '',
					root: '',
					private: false,
					published: false,
					home: false,
					theme: {
						name: defaultTheme.id
					}
				};
				var templateData = {
					title: 'Site dashboard',
					navigation: true,
					footer: true,
					breadcrumb: [
						{
							link: '/sites',
							icon: 'dashboard',
							label: 'Site dashboard'
						}
					],
					content: {
						sites: res.locals.sites,
						site: siteModel,
						themes: themes
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
					'theme': {
						'name': req.body.theme,
						'config': themes[req.body.theme].defaults
					},
					'root': req.body.root || null,
					'private': req.body.private === 'true',
					'users': [],
					'published': req.body.published === 'true',
					'cache': null
				};

				var isDefaultSite = (req.body.home === 'true');

				createSite(accessToken, siteModel)
					.then(function(siteModel) {
						if (!isDefaultSite) { return siteModel; }
						return updateUserDefaultSiteName(uid, siteModel.name)
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
			}

			function retrieveSiteRoute(req, res, next) {
				var userModel = req.user;
				var uid = userModel.uid;
				var defaultSiteName = userModel.defaultSite;
				var accessToken = userModel.token;
				var siteName = req.params.site;
				var includeTheme = false;
				var includeContents = false;
				var includeUsers = true;
				retrieveSite(accessToken, uid, siteName, includeTheme, includeContents, includeUsers)
					.then(function(siteModel) {
						var isDefaultSite = (siteModel.name === defaultSiteName);
						siteModel.home = isDefaultSite;
						return siteModel;
					})
					.then(function(siteModel) {
						var templateData = {
							title: 'Site settings: ' + siteModel.label,
							navigation: true,
							footer: true,
							breadcrumb: [
								{
									link: '/sites',
									icon: 'dashboard',
									label: 'Site dashboard'
								},
								{
									link: '/sites/' + siteName,
									icon: 'globe',
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
				var themeConfig = parseThemeConfig(req.body);
				if (req.body.theme || themeConfig) {
					updates.theme = {};
					if (req.body.theme) {
						updates.theme.name = req.body.theme;
					}
					if (themeConfig) {
						updates.theme.config = themeConfig;
					}
				}
				if (req.body.root) { updates.root = req.body.root || null; }
				if (req.body.private) { updates.private = req.body.private === 'true'; }
				if (req.body.published) { updates.published = req.body.published === 'true'; }

				var isDefaultSite = siteName === defaultSiteName;
				var isUpdatedDefaultSite = ('home' in req.body ? req.body.home === 'true' : isDefaultSite);
				var updatedSiteName = ('name' in updates ? updates.name : siteName);
				updateSite(accessToken, uid, siteName, updates)
					.then(function() {
						var updatedDefaultSiteName = (isUpdatedDefaultSite ? updatedSiteName : (isDefaultSite ? null : defaultSiteName));
						if (updatedDefaultSiteName === defaultSiteName) { return; }
						return updateUserDefaultSiteName(uid, updatedDefaultSiteName);
					})
					.then(function() {
						var isThemeUpdate = (req.body._action === 'theme');
						res.redirect(303, (isThemeUpdate ? '/sites/' + updatedSiteName + '/theme' : '/sites/' + updatedSiteName));
					})
					.catch(function(error) {
						next(error);
					});


				function parseThemeConfig(requestBody) {
					var CONFIG_FIELD_PREFIX = 'theme.config.';
					var themeConfigFields = Object.keys(requestBody).filter(function(key) {
						return key.indexOf(CONFIG_FIELD_PREFIX) === 0;
					});
					if (themeConfigFields.length === 0) { return null; }
					return themeConfigFields.map(function(key) {
						var unprefixedKey = key.slice(CONFIG_FIELD_PREFIX.length);
						var segments = unprefixedKey.split('.');
						var configGroup = segments[0];
						var configField = segments[1];
						var value = requestBody[key];
						return { group: configGroup, field: configField, value: value };
					})
					.reduce(function(config, configItem) {
						var configGroup = config[configItem.group] || {};
						configGroup[configItem.field] = configItem.value;
						config[configItem.group] = configGroup;
						return config;
					}, {});
				}
			}

			function purgeSiteRoute(req, res, next) {
				var userModel = req.user;
				var uid = userModel.uid;
				var accessToken = userModel.token;
				var siteName = req.params.site;
				purgeSite(accessToken, uid, siteName)
					.then(function() {
						res.redirect(303, '/sites/' + siteName);
					})
					.catch(function(error) {
						next(error);
					});
			}

			function deleteSiteRoute(req, res, next) {
				var userModel = req.user;
				var uid = userModel.uid;
				var accessToken = userModel.token;
				var siteName = req.params.site;
				deleteSite(accessToken, uid, siteName)
					.then(function(siteModel) {
						res.redirect(303, '/sites');
					})
					.catch(function(error) {
						next(error);
					});
			}

			function retrieveSiteUsersRoute(req, res, next) {
				var userModel = req.user;
				var uid = userModel.uid;
				var accessToken = userModel.token;
				var siteName = req.params.site;
				var includeTheme = false;
				var includeContents = false;
				var includeUsers = true;
				retrieveSite(accessToken, uid, siteName, includeTheme, includeContents, includeUsers)
					.then(function(siteModel) {
						var templateData = {
							title: 'Edit site users: ' + siteModel.label,
							navigation: true,
							footer: true,
							breadcrumb: [
								{
									link: '/sites',
									icon: 'dashboard',
									label: 'Site dashboard'
								},
								{
									link: '/sites/' + siteName,
									icon: 'globe',
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
			}

			function createSiteUserRoute(req, res, next) {
				var userModel = req.user;
				var uid = userModel.uid;
				var accessToken = userModel.token;
				var siteName = req.params.site;
				var username = req.body.username;
				var password = req.body.password;
				createSiteUser(accessToken, uid, siteName, {
					username: username,
					password: password
				})
					.then(function(userModel) {
						res.redirect(303, '/sites/' + siteName + '/users');
					})
					.catch(function(error) {
						next(error);
					});
			}

			function updateSiteUserRoute(req, res, next) {
				var userModel = req.user;
				var uid = userModel.uid;
				var accessToken = userModel.token;
				var siteName = req.params.site;
				var username = req.params.username;
				var password = req.body.password;
				updateSiteUser(accessToken, uid, siteName, username, {
					username: username,
					password: password
				})
					.then(function(userModel) {
						res.redirect(303, '/sites/' + siteName + '/users');
					})
					.catch(function(error) {
						next(error);
					});
			}

			function deleteSiteUserRoute(req, res, next) {
				var userModel = req.user;
				var uid = userModel.uid;
				var accessToken = userModel.token;
				var siteName = req.params.site;
				var username = req.params.username;
				deleteSiteUser(accessToken, uid, siteName, username)
					.then(function() {
						res.redirect(303, '/sites/' + siteName + '/users');
					})
					.catch(function(error) {
						next(error);
					});
			}

			function retrieveSiteThemeRoute(req, res, next) {
				var userModel = req.user;
				var uid = userModel.uid;
				var accessToken = userModel.token;
				var siteName = req.params.site;
				var includeTheme = true;
				var includeContents = false;
				var includeUsers = false;
				retrieveSite(accessToken, uid, siteName, includeTheme, includeContents, includeUsers)
					.then(function(siteModel) {
						var templateData = {
							title: 'Theme editor',
							stylesheets: [
								'/assets/css/bootstrap-colorpicker.min.css',
								'/assets/css/shunt-editor.css'
							],
							scripts: [
								'/assets/js/bootstrap-colorpicker.min.js',
								'/assets/js/shunt-editor.js'
							],
							fullHeight: true,
							navigation: false,
							footer: false,
							breadcrumb: [
								{
									link: '/sites',
									icon: 'dashboard',
									label: 'Site dashboard'
								},
								{
									link: '/sites/' + siteName,
									icon: 'globe',
									label: siteModel.label
								},
								{
									link: '/sites/' + siteName + '/theme',
									icon: 'paint-brush',
									label: 'Theme editor'
								}
							],
							content: {
								site: siteModel,
								themes: themes
							}
						};
						return renderAdminPage(req, res, 'sites/site/theme', templateData);
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
				getDropboxFileMetadata(accessToken, uid, dropboxPath)
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

			function createPreviewApp(database, options) {
				options = options || {};
				var host = options.host;
				var appKey = options.appKey;
				var appSecret = options.appSecret;
				var themesUrl = options.themesUrl;

				var app = express();
				app.use(ensureAuth);
				app.use(initAdminSession);
				app.use(addUsernamePathPrefix);
				app.use(sitesApp(database, {
					preview: true,
					host: host,
					appKey: appKey,
					appSecret: appSecret,
					themesUrl: themesUrl
				}));
				return app;


				function addUsernamePathPrefix(req, res, next) {
					req.url = '/' + req.user.username + req.url;
					next();
				}
			}
		}

		function retrieveUserSites(uid) {
			var userService = new UserService(database);
			return userService.retrieveUserSites(uid);
		}

		function updateUser(uid, updates) {
			var userService = new UserService(database);
			return userService.updateUser(uid, updates);
		}

		function updateUserDefaultSiteName(uid, siteName) {
			var userService = new UserService(database);
			return userService.updateUserDefaultSiteName(uid, siteName);
		}

		function deleteUser(uid) {
			var userService = new UserService(database);
			return userService.deleteUser(uid);
		}

		function createSite(accessToken, siteModel) {
			var siteService = new SiteService(database, {
				host: host,
				appKey: appKey,
				appSecret: appSecret,
				accessToken: accessToken
			});
			return siteService.createSite(siteModel);
		}

		function retrieveSite(accessToken, uid, siteName, includeTheme, includeContents, includeUsers) {
			var siteService = new SiteService(database, {
				host: host,
				appKey: appKey,
				appSecret: appSecret,
				accessToken: accessToken
			});
			return siteService.retrieveSite(uid, siteName, {
				theme: includeTheme,
				contents: includeContents,
				users: includeUsers
			});
		}

		function updateSite(accessToken, uid, siteName, updates) {
			var siteService = new SiteService(database, {
				host: host,
				appKey: appKey,
				appSecret: appSecret,
				accessToken: accessToken
			});
			return siteService.updateSite(uid, siteName, updates);
		}

		function purgeSite(accessToken, uid, siteName) {
			var cache = null;
			var siteService = new SiteService(database, {
				host: host,
				appKey: appKey,
				appSecret: appSecret,
				accessToken: accessToken
			});
			return siteService.updateSiteCache(uid, siteName, cache);
		}

		function deleteSite(accessToken, uid, siteName) {
			var siteService = new SiteService(database, {
				host: host,
				appKey: appKey,
				appSecret: appSecret,
				accessToken: accessToken
			});
			return siteService.deleteSite(uid, siteName);
		}

		function createSiteUser(accessToken, uid, siteName, authDetails) {
			var siteService = new SiteService(database, {
				host: host,
				appKey: appKey,
				appSecret: appSecret,
				accessToken: accessToken
			});
			return siteService.createSiteUser(uid, siteName, authDetails);
		}

		function updateSiteUser(accessToken, uid, siteName, username, authDetails) {
			var siteService = new SiteService(database, {
				host: host,
				appKey: appKey,
				appSecret: appSecret,
				accessToken: accessToken
			});
			return siteService.updateSiteUser(uid, siteName, username, authDetails);
		}

		function deleteSiteUser(accessToken, uid, siteName, username) {
			var siteService = new SiteService(database, {
				host: host,
				appKey: appKey,
				appSecret: appSecret,
				accessToken: accessToken
			});
			return siteService.deleteSiteUser(uid, siteName, username);
		}

		function getDropboxFileMetadata(accessToken, uid, dropboxPath) {
			var siteService = new SiteService(database, {
				host: host,
				appKey: appKey,
				appSecret: appSecret,
				accessToken: accessToken
			});
			return siteService.getDropboxFileMetadata(uid, dropboxPath);
		}
	}
};
