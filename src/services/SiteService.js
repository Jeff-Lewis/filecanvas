'use strict';

var path = require('path');
var objectAssign = require('object-assign');
var isTextOrBinary = require('istextorbinary');
var template = require('es6-template-strings');

var parseShortcutUrl = require('../utils/parseShortcutUrl');

var HttpError = require('../errors/HttpError');

var UserService = require('../services/UserService');
var MarkdownService = require('./MarkdownService');
var AuthenticationService = require('../services/AuthenticationService');

var constants = require('../constants');

var SECONDS = 1000;
var DROPBOX_CACHE_EXPIRY_DURATION = 5 * SECONDS;
var DB_COLLECTION_SITES = constants.DB_COLLECTION_SITES;

function SiteService(database, options) {
	options = options || {};
	var host = options.host;
	var adapters = options.adapters;

	if (!database) { throw new Error('Missing database'); }
	if (!host) { throw new Error('Missing host details'); }
	if (!adapters) { throw new Error('Missing adapters configuration'); }

	this.database = database;
	this.host = host;
	this.adapters = adapters;
}

SiteService.prototype.database = null;

SiteService.prototype.createSite = function(siteModel, siteTemplateFiles) {
	if (!siteModel) { return Promise.reject(new Error('No site model specified')); }
	var database = this.database;
	var host = this.host;
	var adapters = this.adapters;
	var requireFullModel = true;
	return validateSiteModel(siteModel, requireFullModel)
		.then(function(siteModel) {
			return createSite(database, siteModel)
				.catch(function(error) {
					if (error.code === database.ERROR_CODE_DUPLICATE_KEY) {
						throw new HttpError(409, 'A canvas already exists at that path');
					}
					throw error;
				});
		})
		.then(function() {
			if (!siteModel.root || !siteTemplateFiles) { return; }
			var username = siteModel.owner;
			var userService = new UserService(database);
			return userService.retrieveUser(username)
				.then(function(userModel) {
					var userAdapters = userModel.adapters;
					var siteRoot = siteModel.root;
					var sitePath = siteRoot.path;
					var context = {
						host: host,
						user: userModel,
						site: siteModel
					};
					return generateSiteFiles(siteTemplateFiles, context)
						.then(function(siteFiles) {
							var siteRoot = siteModel.root;
							var siteAdapter = siteRoot.adapter;
							var adapter = adapters[siteAdapter];
							var adapterOptions = userAdapters[siteAdapter];
							return adapter.initSiteFolder(sitePath, siteFiles, adapterOptions);
						});
				});
		})
		.then(function() {
			return siteModel;
		});
};

SiteService.prototype.retrieveSite = function(username, siteName, options) {
	if (!username) { return Promise.reject(new Error('No username specified')); }
	if (!siteName) { return Promise.reject(new Error('No site specified')); }
	options = options || {};
	var onlyPublishedSites = Boolean(options.published);
	var includeTheme = Boolean(options.theme);
	var includeContents = Boolean(options.contents);
	var includeUsers = Boolean(options.users);
	var cacheDuration = (typeof options.cacheDuration === 'number' ? options.cacheDuration : DROPBOX_CACHE_EXPIRY_DURATION);
	var database = this.database;
	var adapters = this.adapters;
	return retrieveSite(database, username, siteName, {
		published: onlyPublishedSites,
		theme: includeTheme,
		contents: includeContents,
		users: includeUsers
	})
		.then(function(siteModel) {
			if (!includeContents) { return siteModel; }
			var hasSiteFolder = (siteModel.root !== null);
			if (!hasSiteFolder) { return null; }
			var siteCache = siteModel.cache;
			var canUseCachedContents = Boolean(siteCache) && getIsCacheValid(siteCache.site, cacheDuration);
			if (canUseCachedContents) {
				siteModel.contents = siteCache.site.contents;
				return siteModel;
			}
			var userService = new UserService(database);
			return userService.retrieveUserAdapters(username)
				.then(function(userAdapters) {
					var siteRoot = siteModel.root;
					var siteAdapter = siteRoot.adapter;
					var sitePath = siteRoot.path;
					var siteCache = siteModel.cache;
					var adapter = adapters[siteAdapter];
					var adapterOptions = objectAssign({}, userAdapters[siteAdapter], {
						cache: siteCache && siteCache.adapter || null
					});
					return adapter.loadFolderContents(sitePath, adapterOptions)
						.then(function(folder) {
							var siteCache = {
								site: {
									contents: folder.root,
									updated: new Date()
								},
								adapter: folder.cache
							};
							return updateSiteCache(database, username, siteName, siteCache)
								.then(function() {
									siteModel.cache = siteCache;
									siteModel.contents = siteCache.site.contents;
									return siteModel;
								});
						});
				});
		});


	function getIsCacheValid(cache, cacheDuration) {
		if (!cache) { return false; }
		var lastCacheUpdateDate = cache.updated;
		var delta = (new Date() - lastCacheUpdateDate);
		return (delta <= cacheDuration);
	}
};

SiteService.prototype.updateSite = function(username, siteName, updates) {
	if (!username) { return Promise.reject(new Error('No username specified')); }
	if (!siteName) { return Promise.reject(new Error('No site specified')); }
	if (!updates) { return Promise.reject(new Error('No updates specified')); }
	var database = this.database;
	var requireFullModel = false;
	return validateSiteModel(updates, requireFullModel)
		.then(function(updates) {
			return checkWhetherIsChangingSiteRoot(username, siteName, updates)
				.then(function(isChangingSiteRoot) {
					if (isChangingSiteRoot) {
						updates.cache = null;
					}
					return updateSite(database, username, siteName, updates);
				});
		});


	function checkWhetherIsChangingSiteRoot(username, siteName, updates) {
		var isUpdatingSiteRoot = 'root' in updates;
		if (!isUpdatingSiteRoot) { return Promise.resolve(false); }
		return retrieveSiteRoot(database, username, siteName)
			.then(function(existingSiteRoot) {
				if (!existingSiteRoot || !updates.root) {
					return existingSiteRoot !== updates.root;
				}
				var siteRootHasChanged =
					(existingSiteRoot.adapter !== updates.root.adapter) ||
					(existingSiteRoot.path !== updates.root.path);
				return siteRootHasChanged;
			});
	}
};

SiteService.prototype.deleteSite = function(username, siteName) {
	if (!username) { return Promise.reject(new Error('No username specified')); }
	if (!siteName) { return Promise.reject(new Error('No site specified')); }
	var database = this.database;
	var userService = new UserService(database);
	return checkWhetherSiteisUserDefaultSite(username, siteName)
		.then(function(isDefaultSite) {
			return deleteSite(database, username, siteName)
				.then(function() {
					if (isDefaultSite) {
						return resetUserDefaultSite(username);
					}
				});
		});


	function checkWhetherSiteisUserDefaultSite(username, siteName) {
		return userService.retrieveUserDefaultSiteName(username)
			.then(function(defaultSiteName) {
				return siteName === defaultSiteName;
			});
	}

	function resetUserDefaultSite(username) {
		return userService.updateUserDefaultSiteName(username, null)
			.then(function(siteName) {
				return;
			});
	}
};

SiteService.prototype.retrieveSiteAuthenticationDetails = function(username, siteName, options) {
	if (!username) { return Promise.reject(new Error('No username specified')); }
	if (!siteName) { return Promise.reject(new Error('No site specified')); }
	options = options || {};
	var onlyPublishedSites = Boolean(options.published);
	var database = this.database;
	return retrieveSiteAuthenticationDetails(database, username, siteName, onlyPublishedSites);
};

SiteService.prototype.retrieveSiteCache = function(username, siteName) {
	if (!username) { return Promise.reject(new Error('No username specified')); }
	if (!siteName) { return Promise.reject(new Error('No site specified')); }
	var database = this.database;
	return retrieveSiteCache(database, username, siteName);
};

SiteService.prototype.updateSiteCache = function(username, siteName, cache) {
	if (!username) { return Promise.reject(new Error('No username specified')); }
	if (!siteName) { return Promise.reject(new Error('No site specified')); }
	cache = cache || null;
	var database = this.database;
	return updateSiteCache(database, username, siteName, cache);
};

SiteService.prototype.retrieveSiteDownloadLink = function(username, siteName, filePath) {
	if (!username) { return Promise.reject(new Error('No username specified')); }
	if (!siteName) { return Promise.reject(new Error('No site specified')); }
	if (!filePath) { return Promise.reject(new Error('No file path specified')); }
	var database = this.database;
	var adapters = this.adapters;
	return retrieveSiteRoot(database, username, siteName)
		.then(function(siteRoot) {
			if (!siteRoot) { throw new HttpError(404); }
			var userService = new UserService(database);
			return userService.retrieveUserAdapters(username)
				.then(function(userAdapters) {
					var siteAdapter = siteRoot.adapter;
					var adapter = adapters[siteAdapter];
					var adapterOptions = userAdapters[siteAdapter];
					return adapter.retrieveDownloadLink(filePath, siteRoot, adapterOptions);
				});
		});
};

SiteService.prototype.retrieveSitePreviewLink = function(username, siteName, filePath) {
	if (!username) { return Promise.reject(new Error('No username specified')); }
	if (!siteName) { return Promise.reject(new Error('No site specified')); }
	if (!filePath) { return Promise.reject(new Error('No file path specified')); }
	var database = this.database;
	var adapters = this.adapters;
	return retrieveSiteRoot(database, username, siteName)
		.then(function(siteRoot) {
			if (!siteRoot) { throw new HttpError(404); }
			var userService = new UserService(database);
			return userService.retrieveUserAdapters(username)
				.then(function(userAdapters) {
					var siteAdapter = siteRoot.adapter;
					var adapter = adapters[siteAdapter];
					var adapterOptions = userAdapters[siteAdapter];
					return adapter.retrievePreviewLink(filePath, siteRoot, adapterOptions);
				});
		});
};

SiteService.prototype.retrieveSiteThumbnailLink = function(username, siteName, filePath) {
	if (!username) { return Promise.reject(new Error('No username specified')); }
	if (!siteName) { return Promise.reject(new Error('No site specified')); }
	if (!filePath) { return Promise.reject(new Error('No file path specified')); }
	var database = this.database;
	var adapters = this.adapters;
	return retrieveSiteRoot(database, username, siteName)
		.then(function(siteRoot) {
			if (!siteRoot) { throw new HttpError(404); }
			var userService = new UserService(database);
			return userService.retrieveUserAdapters(username)
				.then(function(userAdapters) {
					var siteAdapter = siteRoot.adapter;
					var adapter = adapters[siteAdapter];
					var adapterOptions = userAdapters[siteAdapter];
					return adapter.retrieveThumbnailLink(filePath, siteRoot, adapterOptions);
				});
		});
};

SiteService.prototype.retrieveSiteShortcutLink = function(username, siteName, filePath) {
	if (!username) { return Promise.reject(new Error('No username specified')); }
	if (!siteName) { return Promise.reject(new Error('No site specified')); }
	if (!filePath) { return Promise.reject(new Error('No file path specified')); }
	var database = this.database;
	var adapters = this.adapters;
	var fileExtension = path.extname(filePath);
	var isShortcutFile = (['.webloc', '.url', '.desktop'].indexOf(fileExtension) !== -1);
	if (!isShortcutFile) { return Promise.reject(new Error('Invalid shortcut file: ' + filePath)); }
	return retrieveSiteRoot(database, username, siteName)
		.then(function(siteRoot) {
			if (!siteRoot) { throw new HttpError(404); }
			var userService = new UserService(database);
			return userService.retrieveUserAdapters(username)
				.then(function(userAdapters) {
					var siteAdapter = siteRoot.adapter;
					var adapter = adapters[siteAdapter];
					var adapterOptions = userAdapters[siteAdapter];
					return adapter.readFile(filePath, siteRoot, adapterOptions);
				})
				.then(function(shortcutData) {
					var shortcutType = fileExtension.substr('.'.length);
					return parseShortcutUrl(shortcutData, { type: shortcutType });
				});
		});
};

SiteService.prototype.createSiteUser = function(username, siteName, authDetails, siteAuthOptions) {
	if (!username) { return Promise.reject(new Error('No username specified')); }
	if (!siteName) { return Promise.reject(new Error('No site specified')); }
	if (!authDetails) { return Promise.reject(new Error('No auth details specified')); }
	if (!authDetails.username) { return Promise.reject(new Error('No auth username specified')); }
	if (!authDetails.password) { return Promise.reject(new Error('No auth password specified')); }
	var database = this.database;
	return checkWhetherSiteUserAlreadyExists(database, username, siteName, authDetails.username)
		.then(function(userAlreadyExists) {
			if (userAlreadyExists) {
				throw new HttpError(409, 'A user already exists with this username');
			}
			return createSiteUser(database, username, siteName, authDetails, siteAuthOptions);
		});
};

SiteService.prototype.updateSiteUser = function(username, siteName, siteUsername, authDetails, siteAuthOptions) {
	if (!username) { return Promise.reject(new Error('No username specified')); }
	if (!siteName) { return Promise.reject(new Error('No site specified')); }
	if (!siteUsername) { return Promise.reject(new Error('No user specified')); }
	if (!authDetails) { return Promise.reject(new Error('No auth details specified')); }
	if (!authDetails.username) { return Promise.reject(new Error('No auth username specified')); }
	if (!authDetails.password) { return Promise.reject(new Error('No auth password specified')); }
	var database = this.database;
	return updateSiteUser(database, username, siteName, siteUsername, authDetails, siteAuthOptions);
};


SiteService.prototype.deleteSiteUser = function(username, siteName, siteUsername) {
	if (!username) { return Promise.reject(new Error('No username specified')); }
	if (!siteName) { return Promise.reject(new Error('No site specified')); }
	if (!siteUsername) { return Promise.reject(new Error('No user specified')); }
	var database = this.database;
	return deleteSiteUser(database, username, siteName, siteUsername);
};

SiteService.prototype.retrieveFileMetadata = function(username, adapterName, filePath) {
	if (!username) { return Promise.reject(new Error('No username specified')); }
	if (!adapterName) { return Promise.reject(new Error('No adapter specified')); }
	if (!filePath) { return Promise.reject(new Error('No file path specified')); }
	var database = this.database;
	var adapters = this.adapters;
	var userService = new UserService(database);
	return userService.retrieveUserAdapters(username)
		.then(function(userAdapters) {
			var adapter = adapters[adapterName];
			var adapterOptions = userAdapters[adapterName];
			return adapter.retrieveFileMetadata(filePath, adapterOptions);
		});
};


function createSite(database, siteModel) {
	return database.collection(DB_COLLECTION_SITES).insertOne(siteModel);
}

function retrieveSite(database, username, siteName, options) {
	options = options || {};
	var onlyPublishedSites = Boolean(options.published);
	var includeTheme = Boolean(options.theme);
	var includeContents = Boolean(options.contents);
	var includeUsers = Boolean(options.users);

	var query = { 'owner': username, 'name': siteName };
	var fields = [
		'owner',
		'name',
		'label',
		'root',
		'private',
		'published'
	];
	if (includeTheme) { fields.push('theme'); }
	if (includeUsers) { fields.push('users'); }
	if (includeContents) { fields.push('cache'); }
	return database.collection(DB_COLLECTION_SITES).findOne(query, fields)
		.then(function(siteModel) {
			if (!siteModel) { throw new HttpError(404); }
			if (onlyPublishedSites && !siteModel.published) { throw new HttpError(404); }
			return siteModel;
		});
}

function updateSite(database, username, siteName, fields) {
	var filter = { 'owner': username, 'name': siteName };
	var updates = { $set: fields };
	return database.collection(DB_COLLECTION_SITES).updateOne(filter, updates)
		.then(function(numRecords) {
			if (numRecords === 0) { throw new HttpError(404); }
			return;
		});
}

function deleteSite(database, username, siteName) {
	var filter = { 'owner': username, 'name': siteName };
	return database.collection(DB_COLLECTION_SITES).deleteOne(filter)
		.then(function(numRecords) {
			if (numRecords === 0) { throw new HttpError(404); }
			return;
		});
}

function retrieveSiteAuthenticationDetails(database, username, siteName, onlyPublishedSites) {
	var query = { 'owner': username, 'name': siteName };
	var fields = [
		'private',
		'users'
	];
	if (onlyPublishedSites) { fields.push('published'); }
	return database.collection(DB_COLLECTION_SITES).findOne(query, fields)
		.then(function(siteModel) {
			if (!siteModel) { throw new HttpError(404); }
			if (onlyPublishedSites && !siteModel.published) { throw new HttpError(404); }
			var authenticationDetails = {
				'private': siteModel.private,
				'users': siteModel.users
			};
			return authenticationDetails;
		});
}

function retrieveSiteRoot(database, username, siteName) {
	var query = { 'owner': username, 'name': siteName };
	var fields = [
		'root'
	];
	return database.collection(DB_COLLECTION_SITES).findOne(query, fields)
		.then(function(siteModel) {
			if (!siteModel) { throw new HttpError(404); }
			var siteRoot = siteModel.root;
			return siteRoot;
		});
}

function retrieveSiteCache(database, username, siteName) {
	var query = { 'owner': username, 'name': siteName };
	var fields = [
		'cache'
	];
	return database.collection(DB_COLLECTION_SITES).findOne(query, fields)
		.then(function(siteModel) {
			if (!siteModel) { throw new HttpError(404); }
			var siteCache = siteModel.cache;
			return siteCache;
		});
}

function updateSiteCache(database, username, siteName, cache) {
	var filter = { 'owner': username, 'name': siteName };
	var updates = { $set: { 'cache': cache } };
	return database.collection(DB_COLLECTION_SITES).updateOne(filter, updates)
		.then(function(numRecords) {
			if (numRecords === 0) { throw new HttpError(404); }
			return;
		});
}

function checkWhetherSiteUserAlreadyExists(database, username, siteName, siteUsername) {
	var query = { 'owner': username, 'name': siteName, 'users.username': siteUsername };
	return database.collection(DB_COLLECTION_SITES).count(query)
		.then(function(numRecords) {
			var userAlreadyExists = (numRecords > 0);
			return userAlreadyExists;
		});
}

function createSiteUser(database, username, siteName, authDetails, siteAuthOptions) {
	var authenticationService = new AuthenticationService();
	var authUsername = authDetails.username;
	var authPassword = authDetails.password;
	var authStrategy = siteAuthOptions.strategy;
	var authOptions = siteAuthOptions.options;
	return authenticationService.create(authUsername, authPassword, authStrategy, authOptions)
		.then(function(siteUserModel) {
			var filter = { 'owner': username, 'name': siteName };
			var updates = { $push: { 'users': siteUserModel } };
			return database.collection(DB_COLLECTION_SITES).updateOne(filter, updates)
				.then(function(numRecords) {
					if (numRecords === 0) {
						throw new HttpError(404);
					}
					return siteUserModel;
				});
		});
}

function updateSiteUser(database, username, siteName, siteUsername, authDetails, siteAuthOptions) {
	var authenticationService = new AuthenticationService();
	var authUsername = authDetails.username;
	var authPassword = authDetails.password;
	var authStrategy = siteAuthOptions.strategy;
	var authOptions = siteAuthOptions.options;
	return authenticationService.create(authUsername, authPassword, authStrategy, authOptions)
		.then(function(siteUserModel) {
			var filter = { 'owner': username, 'name': siteName, 'users.username': siteUsername };
			var updates = { $set: { 'users.$': siteUserModel } };
			return database.collection(DB_COLLECTION_SITES).updateOne(filter, updates)
				.then(function(numRecords) {
					if (numRecords === 0) { throw new HttpError(404); }
					return;
				});
		});
}

function deleteSiteUser(database, username, siteName, siteUsername) {
	var filter = { 'owner': username, 'name': siteName };
	var updates = { $pull: { 'users': { 'username': siteUsername } } };
	return database.collection(DB_COLLECTION_SITES).updateOne(filter, updates)
		.then(function(numRecords) {
			if (numRecords === 0) { throw new HttpError(404); }
			return;
		});
}

function generateSiteFiles(siteTemplateFiles, context) {
	var flattenedTemplateFiles = flattenPathHierarchy(siteTemplateFiles);
	var expandedTemplateFiles = expandPlaceholders(flattenedTemplateFiles, context);
	return convertMarkdownFiles(expandedTemplateFiles);


	function flattenPathHierarchy(tree, pathPrefix) {
		pathPrefix = pathPrefix || '';
		var flattenedFiles = Object.keys(tree).reduce(function(flattenedFiles, filename) {
			var filePath = path.join(pathPrefix, filename);
			var fileObject = tree[filename];
			var isFile = Buffer.isBuffer(fileObject) || fileObject instanceof String;
			if (isFile) {
				flattenedFiles[filePath] = fileObject;
			} else {
				var childPaths = flattenPathHierarchy(fileObject, filePath);
				objectAssign(flattenedFiles, childPaths);
			}
			return flattenedFiles;
		}, {});
		return flattenedFiles;
	}

	function expandPlaceholders(files, context) {
		var expandedFiles = Object.keys(files).reduce(function(expandedFiles, filePath) {
			var filename = path.basename(filePath);
			var fileBuffer = files[filePath];
			var expandedFileBuffer = expandFilePlaceholders(filename, fileBuffer, context);
			expandedFiles[filePath] = expandedFileBuffer;
			return expandedFiles;
		}, {});
		return expandedFiles;


		function expandFilePlaceholders(filename, fileBuffer, context) {
			var isTextFile = getIsTextFile(filename, fileBuffer);
			if (!isTextFile) { return fileBuffer; }
			var templateString = fileBuffer.toString();
			var output = expandPlaceholderStrings(templateString, context);
			return new Buffer(output);


			function getIsTextFile(filePath, fileBuffer) {
				return isTextOrBinary.isTextSync(filePath, fileBuffer);
			}

			function expandPlaceholderStrings(source, context) {
				return template(source, context);
			}
		}
	}

	function convertMarkdownFiles(files) {
		var filePaths = Object.keys(files);
		return Promise.all(filePaths.map(function(filePath) {
			var filename = path.basename(filePath);
			var fileBuffer = files[filePath];
			var isMarkdownFile = getIsMarkdownFile(filename, fileBuffer);
			if (!isMarkdownFile) {
				return Promise.resolve({
					path: filePath,
					data: fileBuffer
				});
			}
			var markdownString = fileBuffer.toString();
			var html = new MarkdownService().renderHtml(markdownString);
			return Promise.resolve({
				path: replaceFileExtension(filePath, '.html'),
				data: new Buffer(html)
			});
		})).then(function(files) {
			var convertedFiles = files.reduce(function(convertedFiles, fileInfo) {
				var filePath = fileInfo.path;
				var fileBuffer = fileInfo.data;
				convertedFiles[filePath] = fileBuffer;
				return convertedFiles;
			}, {});
			return convertedFiles;
		});

		function getIsMarkdownFile(filename, file) {
			return (path.extname(filename) === '.md');
		}

		function replaceFileExtension(filePath, extension) {
			return path.join(path.dirname(filePath), path.basename(filePath, path.extname(filePath)) + extension);
		}
	}
}

function validateSiteModel(siteModel, requireFullModel) {
	return new Promise(function(resolve, reject) {
		if (!siteModel) { throw new HttpError(400, 'No site model specified'); }
		if ((requireFullModel || ('owner' in siteModel)) && !siteModel.owner) { throw new HttpError(400, 'No owner specified'); }
		if ((requireFullModel || ('name' in siteModel)) && !siteModel.name) { throw new HttpError(400, 'No site name specified'); }
		if ((requireFullModel || ('label' in siteModel)) && !siteModel.label) { throw new HttpError(400, 'No site label specified'); }
		if ((requireFullModel || ('theme' in siteModel)) && !siteModel.theme) { throw new HttpError(400, 'No site theme specified'); }

		// TODO: Validate owner when validating site model
		// TODO: Validate name when validating site model
		// TODO: Validate label when validating site model
		// TODO: Validate theme when validating site model
		// TODO: Validate root when validating site model
		// TODO: Validate home option when validating site model

		resolve(siteModel);
	});
}

module.exports = SiteService;
