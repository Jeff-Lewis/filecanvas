'use strict';

var express = require('express');
var slug = require('slug');
var mapSeries = require('promise-map-series');
var DropboxOAuth2Strategy = require('passport-dropbox-oauth2').Strategy;

var DropboxService = require('../services/DropboxService');
var UserService = require('../services/UserService');

var FileModel = require('../models/FileModel');

var HttpError = require('../errors/HttpError');

function DropboxAdapter(database, options) {
	var appKey = options.appKey;
	var appSecret = options.appSecret;
	var loginCallbackUrl = options.loginCallbackUrl;
	var registerCallbackUrl = options.registerCallbackUrl;

	if (!database) { throw new Error('Missing database'); }
	if (!appKey) { throw new Error('Missing Dropbox app key'); }
	if (!appSecret) { throw new Error('Missing Dropbox app appSecret'); }
	if (!loginCallbackUrl) { throw new Error('Missing Dropbox login callback URL'); }
	if (!registerCallbackUrl) { throw new Error('Missing Dropbox register callback URL'); }

	this.database = database;
	this.appKey = appKey;
	this.appSecret = appSecret;
	this.loginCallbackUrl = loginCallbackUrl;
	this.registerCallbackUrl = registerCallbackUrl;
}

DropboxAdapter.prototype.loginPath = '/oauth2';
DropboxAdapter.prototype.registerPath = '/oauth2';

DropboxAdapter.prototype.getUploadConfig = function(sitePath, options) {
	return {
		name: 'dropbox',
		path: sitePath,
		token: options.token
	};
};

DropboxAdapter.prototype.loginMiddleware = function(passport, passportOptions, callback) {
	var database = this.database;
	var appKey = this.appKey;
	var appSecret = this.appSecret;
	var loginCallbackUrl = this.loginCallbackUrl;

	var app = express();

	app.get('/oauth2', passport.authenticate('dropbox/login'));
	app.get('/oauth2/callback', passport.authenticate('dropbox/login', passportOptions), callback);

	passport.use('dropbox/login', new DropboxOAuth2Strategy({
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


			function loginUser(uid, accessToken, dropboxFirstName, dropboxLastName, dropboxEmail) {
				var userService = new UserService(database);
				return userService.retrieveAdapterUser('dropbox', { 'uid': uid })
					.catch(function(error) {
						if (error.status === 404) {
							throw new HttpError(403, dropboxEmail + ' is not a registered user');
						}
						throw error;
					})
					.then(function(userModel) {
						var username = userModel.username;
						var dropboxAdapterConfig = userModel.adapters.dropbox;
						var hasUpdatedAccessToken = accessToken !== dropboxAdapterConfig.token;
						var hasUpdatedProfileFirstName = dropboxFirstName !== dropboxAdapterConfig.firstName;
						var hasUpdatedProfileLastName = dropboxLastName !== dropboxAdapterConfig.lastName;
						var hasUpdatedProfileEmail = dropboxEmail !== dropboxAdapterConfig.email;
						var hasUpdatedUserDetails = hasUpdatedAccessToken || hasUpdatedProfileFirstName || hasUpdatedProfileLastName || hasUpdatedProfileEmail;
						if (hasUpdatedUserDetails) {
							return userService.updateUserAdapterSettings(username, 'dropbox', {
								uid: uid,
								token: accessToken,
								firstName: dropboxFirstName,
								lastName: dropboxLastName,
								email: dropboxEmail
							})
								.then(function() {
									var dropboxAdapterConfig = userModel.adapters.dropbox;
									dropboxAdapterConfig.token = accessToken;
									dropboxAdapterConfig.firstName = dropboxFirstName;
									dropboxAdapterConfig.lastName = dropboxLastName;
									dropboxAdapterConfig.email = dropboxEmail;
									return userModel;
								});
						} else {
							return userModel;
						}
					});
			}
		}
	));

	return app;
};

DropboxAdapter.prototype.registerMiddleware = function(passport, passportOptions, callback) {
	var database = this.database;
	var appKey = this.appKey;
	var appSecret = this.appSecret;
	var registerCallbackUrl = this.registerCallbackUrl;

	var app = express();

	app.get('/oauth2', passport.authenticate('dropbox/register'));
	app.get('/oauth2/callback', passport.authenticate('dropbox/register', passportOptions), callback);

	passport.use('dropbox/register', new DropboxOAuth2Strategy(
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


			function registerUser(uid, accessToken, firstName, lastName, email) {
				var fullName = firstName + ' ' + lastName;
				var username = slug(fullName, { lower: true });
				var userDetails = {
					username: username,
					firstName: firstName,
					lastName: lastName,
					email: email
				};
				var adapterConfig = {
					uid: uid,
					token: accessToken,
					firstName: firstName,
					lastName: lastName,
					email: email
				};
				var userService = new UserService(database);
				return userService.registerUser(userDetails, 'dropbox', adapterConfig);
			}
		}
	));

	return app;
};

DropboxAdapter.prototype.initSiteFolder = function(sitePath, siteFiles, options) {
	var appKey = this.appKey;
	var appSecret = this.appSecret;
	var uid = options.uid;
	var accessToken = options.token;
	return new DropboxService().connect(appKey, appSecret, accessToken, uid)
		.then(function(dropboxClient) {
			return checkWhetherFileExists(dropboxClient, sitePath)
				.then(function(folderExists) {
					if (folderExists) { return; }
					return copySiteFiles(dropboxClient, siteFiles);
				});
		});

	function checkWhetherFileExists(dropboxClient, filePath) {
		return dropboxClient.retrieveFileMetadata(filePath)
			.then(function(stat) {
				if (stat.isRemoved) { return false; }
				return true;
			})
			.catch(function(error) {
				if (error.status === 404) {
					return false;
				}
				throw error;
			});
	}

	function copySiteFiles(dropboxClient, dirContents) {
		var files = getFileListing(dirContents);
		var writeOptions = {};
		return Promise.resolve(mapSeries(files, function(fileMetaData) {
			var filePath = fileMetaData.path;
			var fileContents = fileMetaData.contents;
			return dropboxClient.writeFile(filePath, fileContents, writeOptions);
		}).then(function(results) {
			return;
		}));


		function getFileListing(namedFiles) {
			var files = Object.keys(namedFiles)
				.sort(function(filePath1, filePath2) {
					return (filePath1 < filePath2 ? -1 : 1);
				})
				.map(function(filePath) {
					var file = namedFiles[filePath];
					return {
						path: filePath,
						contents: file
					};
				});
			return files;
		}
	}
};

DropboxAdapter.prototype.loadFolderContents = function(folderPath, options) {
	var appKey = this.appKey;
	var appSecret = this.appSecret;
	var uid = options.uid;
	var accessToken = options.token;
	var cache = options.cache;
	return new DropboxService().connect(appKey, appSecret, accessToken, uid)
		.then(function(dropboxClient) {
			return dropboxClient.loadFolderContents(folderPath, cache);
		})
		.then(function(dropboxContents) {
			var folder = parseStatModel(dropboxContents.data, folderPath);
			return {
				root: folder,
				cache: dropboxContents
			};
		});


		function parseStatModel(statModel, folderPath) {
			if (!statModel) { return null; }
			var fileMetadata = {
				path: statModel.path.replace(folderPath, '') || '/',
				mimeType: statModel.mime_type,
				size: statModel.bytes,
				modified: new Date(statModel.modified),
				readOnly: statModel.read_only,
				thumbnail: statModel.thumb_exists
			};
			if (statModel.is_dir) {
				fileMetadata.directory = true;
				fileMetadata.contents = statModel.contents.map(function(childStatModel) {
					return parseStatModel(childStatModel, folderPath);
				});
			}
			return new FileModel(fileMetadata);
		}
};

DropboxAdapter.prototype.retrieveDownloadLink = function(filePath, options) {
	var appKey = this.appKey;
	var appSecret = this.appSecret;
	var uid = options.uid;
	var accessToken = options.token;
	return new DropboxService().connect(appKey, appSecret, accessToken, uid)
		.then(function(dropboxClient) {
			return dropboxClient.generateDownloadLink(filePath);
		});
};

DropboxAdapter.prototype.retrieveThumbnailLink = function(filePath, options) {
	var appKey = this.appKey;
	var appSecret = this.appSecret;
	var uid = options.uid;
	var accessToken = options.token;
	return new DropboxService().connect(appKey, appSecret, accessToken, uid)
		.then(function(dropboxClient) {
			return dropboxClient.generateThumbnailLink(filePath);
		});
};

DropboxAdapter.prototype.retrieveFileMetadata = function(filePath, options) {
	var appKey = this.appKey;
	var appSecret = this.appSecret;
	var uid = options.uid;
	var accessToken = options.token;
	return new DropboxService().connect(appKey, appSecret, accessToken, uid)
		.then(function(dropboxClient) {
			return dropboxClient.retrieveFileMetadata(filePath)
				.then(function(stat) {
					return stat.json();
				});
		});
};

module.exports = DropboxAdapter;
