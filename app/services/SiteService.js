module.exports = (function() {
	'use strict';

	var DownloadService = require('../services/DownloadService');
	var OrganizationService = require('../services/OrganizationService');
	var AuthenticationService = require('../services/AuthenticationService');

	var SECONDS = 1000;
	var MINUTES = SECONDS * 60;
	var DROPBOX_DELTA_CACHE_EXPIRY = 5 * MINUTES;

	var MONGO_ERROR_CODE_DUPLICATE_KEY = 11000;

	var SITE_CONTENTS_DOWNLOAD_URL_PREFIX = 'download';

	var DB_COLLECTION_SITES = 'sites';
	var DB_COLLECTION_ORGANIZATIONS = 'organizations';

	function SiteService(dataService, dropboxService) {
		this.dataService = dataService;
		this.dropboxService = dropboxService;
	}

	SiteService.prototype.dataService = null;
	SiteService.prototype.dropboxService = null;

	SiteService.prototype.retrieveFolderPath = function(organizationAlias, siteAlias, callback) {
		var query = { 'organization': organizationAlias, 'alias': siteAlias };
		var projection = { '_id': 0, 'public': 0, 'users': 0 };

		var self = this;
		this.dataService.db.collection(DB_COLLECTION_SITES).findOne(query, projection,
			function(error, siteModel) {
				if (error) { return callback && callback(error); }

				var siteFolderPath = _getSiteFolderPath(organizationAlias, siteModel, self.dataService);

				return callback && callback(null, siteFolderPath);


				function _getSiteFolderPath(organizationAlias, siteModel, dataService) {
					var organizationService = new OrganizationService(dataService);
					var organizationShareRoot = organizationService.getOrganizationShareRoot(organizationAlias);
					var sitePath = organizationShareRoot + siteModel.share;
					return sitePath;
				}
			}
		);
	};

	SiteService.prototype.retrieveDownloadLink = function(organizationAlias, siteAlias, downloadPath, callback) {
		var downloadService = new DownloadService(this.dropboxService);
		this.retrieveFolderPath(organizationAlias, siteAlias, _handleFolderPathRetrieved);


		function _handleFolderPathRetrieved(error, folderPath) {
			if (error) { return callback && callback(error); }

			var dropboxFilePath = folderPath + '/' + downloadPath;
			downloadService.retrieveDownloadLink(dropboxFilePath, _handleDownloadLinkRetrieved);
		}

		function _handleDownloadLinkRetrieved(error, downloadUrl) {
			if (error) { return callback && callback(error); }
			return callback && callback(null, downloadUrl);
		}
	};

	SiteService.prototype.retrieveAuthenticationDetails = function(organizationAlias, siteAlias, callback) {
		var query = { 'organization': organizationAlias, 'alias': siteAlias };
		var projection = { 'public': 1, 'users': 1 };

		this.dataService.db.collection(DB_COLLECTION_SITES).findOne(query, projection,
			function(error, siteModel) {
				if (error) { return callback && callback(error); }
				if (!siteModel) {
					error = new Error();
					error.status = 404;
					return callback && callback(error);
				}

				var authenticationDetails = {
					'public': siteModel['public'],
					'users': siteModel['users']
				};

				return callback && callback(null, authenticationDetails);
			}
		);
	};

	SiteService.prototype.retrieveSite = function(organizationAlias, siteAlias, includeContents, includeUsers, callback) {
		var query = { 'organization': organizationAlias, 'alias': siteAlias };
		var projection = { '_id': 0 };
		if (!includeUsers) {
			projection['public'] = 0;
			projection.users = 0;
		}
		if (!includeContents) { projection.cache = 0; }

		var self = this;
		this.dataService.db.collection(DB_COLLECTION_SITES).findOne(query, projection,
			function(error, siteModel) {
				if (error) { return callback && callback(error); }
				if (!siteModel) {
					error = new Error();
					error.status = 404;
					return callback && callback(error);
				}
				if (!includeContents) { return callback && callback(null, siteModel); }

				var siteFolderPath = _getSiteFolderPath(organizationAlias, siteModel, self.dataService);
				
				var hasSiteFolder = (siteFolderPath !== null);
				if (!hasSiteFolder) { return callback && callback(null, siteModel); }

				var downloadUrlPrefix = SITE_CONTENTS_DOWNLOAD_URL_PREFIX;
				self._loadFolderContents(siteFolderPath, siteModel.cache, downloadUrlPrefix, _handleSiteContentsLoaded);


				function _getSiteFolderPath(organizationAlias, siteModel, dataService) {
					var shareAlias = siteModel.share;
					if (!shareAlias) { return null; }
					var organizationService = new OrganizationService(dataService);
					var organizationShareRoot = organizationService.getOrganizationShareRoot(organizationAlias);
					var sitePath = organizationShareRoot + siteModel.share;
					return sitePath;
				}

				function _handleSiteContentsLoaded(error, siteContents, siteCache) {
					if (error) { return callback && callback(error); }
					siteModel.contents = siteContents;
					delete siteModel.cache;
					self.updateSiteCache(organizationAlias, siteAlias, siteCache);
					return callback && callback(null, siteModel);
				}
			}
		);
	};

	SiteService.prototype.retrieveSiteCache = function(organizationAlias, siteAlias, callback) {
		var query = { 'organization': organizationAlias, 'alias': siteAlias };
		var projection = { 'cache': 1 };

		this.dataService.db.collection(DB_COLLECTION_SITES).findOne(query, projection,
			function(error, siteModel) {
				if (!siteModel) {
					error = new Error();
					error.status = 404;
					return callback && callback(error);
				}
				if (error) { return callback && callback(error); }
				return callback && callback(null, siteModel.cache);
			}
		);
	};

	SiteService.prototype.updateSiteCache = function(organizationAlias, siteAlias, cache, callback) {
		cache = cache || null;

		var criteria = { 'organization': organizationAlias, 'alias': siteAlias };
		var update = { $set: { 'cache': cache } };
		var options = { safe: true };

		this.dataService.db.collection(DB_COLLECTION_SITES).update(criteria, update, options,
			function(error, numResults) {
				if (error) { return callback && callback(error); }
				if (numResults === 0) {
					error = new Error();
					error.status = 404;
					return callback && callback(error);
				}
				return callback && callback(null);
			}
		);
	};

	SiteService.prototype.createSite = function(siteModel, callback) {
		var self = this;
		_parseSiteModel(siteModel, _handleSiteModelParsed);

		function _handleSiteModelParsed(error, siteModel) {
			if (error) { return callback && callback(error); }

			var options = { safe: true };

			self.dataService.db.collection(DB_COLLECTION_SITES).insert(siteModel, options,
				function(error, records) {
					if (error && (error.code === MONGO_ERROR_CODE_DUPLICATE_KEY)) {
						error = new Error('A site already exists at that path');
						error.status = 409;
						return callback && callback(error);
					}
					if (error) { return callback && callback(error); }
					return callback && callback(null, siteModel);
				}
			);
		}
	};


	SiteService.prototype.updateSite = function(organizationAlias, siteAlias, siteModel, callback) {
		var self = this;
		_parseSiteModel(siteModel, _handleSiteModelParsed);

		function _handleSiteModelParsed(error, siteModelFields) {
			if (error) { return callback && callback(error); }

			_getSiteShareAlias(organizationAlias, siteAlias, _handleSiteShareAliasLoaded);


			function _handleSiteShareAliasLoaded(error, currentShareAlias) {
				if (error) { return callback && callback(error); }

				var shareAliasHasChanged = (currentShareAlias !== siteModelFields.share);
				if (!shareAliasHasChanged) {
					delete siteModelFields.share;
					delete siteModelFields.cache;
				}

				// TODO: Handle updating of site users
				delete siteModelFields.users;

				_updateSite(organizationAlias, siteAlias, siteModelFields, _handleSiteUpdated);


				function _handleSiteUpdated(error, siteModel) {
					if (error) { return callback && callback(error); }
					return callback && callback(null, siteModel);
				}
			}
		}

		function _getSiteShareAlias(organizationAlias, siteAlias, callback) {
			var query = { 'organization': organizationAlias, 'alias': siteAlias };
			var projection = { 'share': 1 };

			self.dataService.db.collection(DB_COLLECTION_SITES).findOne(query, projection,
				function(error, siteModel) {
					if (error) { return callback && callback(error); }
					if (!siteModel) {
						error = new Error();
						error.status = 404;
						return callback && callback(error);
					}
					var shareAlias = siteModel.share;
					return callback && callback(null, shareAlias);
				}
			);
		}

		function _updateSite(organizationAlias, siteAlias, siteModelFields) {
			var criteria = { 'organization': organizationAlias, 'alias': siteAlias };
			var updates = { $set: siteModelFields };
			var options = { safe: true };

			self.dataService.db.collection(DB_COLLECTION_SITES).update(criteria, updates, options,
				function(error, numRecords) {
					if (error) { return callback && callback(error); }
					if (numRecords === 0) {
						error = new Error();
						error.status = 404;
						return callback && callback(error);
					}
					return callback && callback(null, siteModel);
				}
			);
		}
	};


	SiteService.prototype.createSiteUser = function(organizationAlias, siteAlias, username, password, callback) {
		if (!organizationAlias) { return _failValidation('No organization specified'); }
		if (!siteAlias) { return _failValidation('No site specified'); }
		if (!username) { return _failValidation('No username specified'); }
		if (!password) { return _failValidation('No password specified'); }

		// TODO: Validate site user details

		var self = this;
		_checkWhetherUserAlreadyExists(organizationAlias, siteAlias, username, _handleCheckedForExistingUser);


		function _handleCheckedForExistingUser(error, userAlreadyExists) {
			if (error) { return callback && callback(error); }
			if (userAlreadyExists) {
				error = new Error('A user already exists with this username');
				error.status = 409;
				return callback && callback(error);
			}
			_addSiteUser(organizationAlias, siteAlias, username, password, _handleSiteUserAdded);


			function _handleSiteUserAdded(error, userModel) {
				if (error) { return callback && callback(error); }
				return callback && callback(null, userModel);
			}
		}

		function _checkWhetherUserAlreadyExists(organizationAlias, siteAlias, username, callback) {
			var query = { 'organization': organizationAlias, 'users.username': username };
			self.dataService.db.collection(DB_COLLECTION_SITES).count(query,
				function(error, numRecords) {
					if (error) { return callback && callback(error); }
					var userAlreadyExists = (numRecords > 0);
					return callback && callback(null, userAlreadyExists);
				}
			);
		}


		function _addSiteUser(organizationAlias, siteAlias, username, password, callback) {
			var authenticationService = new AuthenticationService();
			var userModel = authenticationService.create(username, password);

			var criteria = { 'organization': organizationAlias, 'alias': siteAlias };
			var updates = { $push: { 'users': userModel } };
			var options = { safe: 1 };

			self.dataService.db.collection(DB_COLLECTION_SITES).update(criteria, updates, options,
				function(error, numRecords) {
					if (error) { return callback && callback(error); }
					if (numRecords === 0) {
						error = new Error();
						error.status = 404;
						return callback && callback(error);
					}
					return callback && callback(null, userModel);
				}
			);
		}

		function _failValidation(message, callback) {
			var error = new Error(message);
			error.status = 400;
			return callback && callback(error);
		}
	};


	SiteService.prototype.deleteSiteUser = function(organizationAlias, siteAlias, username, callback) {
		if (!organizationAlias) { return _failValidation('No organization specified'); }
		if (!siteAlias) { return _failValidation('No site specified'); }
		if (!username) { return _failValidation('No user specified'); }

		var self = this;
		_deleteSiteUser(organizationAlias, siteAlias, username, _handleSiteUserDeleted);


		function _handleSiteUserDeleted(error) {
			if (error) { return callback && callback(error); }
			return callback && callback(null);
		}

		function _deleteSiteUser(organizationAlias, shareAlias, username, callback) {
			var criteria = { 'organization': organizationAlias, 'alias': siteAlias };
			var updates = { $pull: { 'users': { 'username': username } } };
			var options = { safe: true };

			self.dataService.db.collection(DB_COLLECTION_SITES).update(criteria, updates, options,
				function(error, numRecords) {
					if (error) { return callback && callback(error); }
					if (numRecords === 0) {
						error = new Error();
						error.status = 404;
						return callback && callback(error);
					}
					return callback && callback(null);
				}
			);
		}

		function _failValidation(message, callback) {
			var error = new Error(message);
			error.status = 400;
			return callback && callback(error);
		}
	};


	SiteService.prototype.deleteSite = function(organizationAlias, siteAlias, callback) {
		if (!organizationAlias) { return _failValidation('No organization specified'); }
		if (!siteAlias) { return _failValidation('No site specified'); }
		// TODO: Validate site delete requests

		var self = this;
		_checkWhetherSiteisOrganizationDefaultSite(organizationAlias, siteAlias, _handleOrganizationDefaultSiteChecked);


		function _handleOrganizationDefaultSiteChecked(error, isDefaultSite) {
			if (error) { return callback && callback(error); }

			_deleteSite(organizationAlias, siteAlias, _handleSiteDeleted);

			function _handleSiteDeleted() {
				if (isDefaultSite) {
					_resetOrganizationDefaultSite(organizationAlias, _handleOrganizationDefaultSiteReset);
				} else {
					return callback && callback(null);
				}

				function _handleOrganizationDefaultSiteReset(error) {
					if (error) { return callback && callback(error); }
					return callback && callback(null);
				}
			}
			
		}

		function _checkWhetherSiteisOrganizationDefaultSite(organizationAlias, siteAlias, callback) {
			var query = { 'alias': organizationAlias, 'default': siteAlias };
			self.dataService.db.collection(DB_COLLECTION_ORGANIZATIONS).count(query,
				function(error, numRecords) {
					if (error) { return callback && callback(error); }
					var isDefaultSite = (numRecords > 0);
					return callback && callback(null, isDefaultSite);
				}
			);
		}

		function _resetOrganizationDefaultSite(organizationAlias, callback) {
			var organizationService = new OrganizationService(self.dataService);
			organizationService.updateOrganizationDefaultSiteAlias(organizationAlias, null, _handleOrganizationDefaultSiteUpdated);


			function _handleOrganizationDefaultSiteUpdated(error) {
				if (error) { return callback && callback(error); }
				return callback && callback(null);
			}
		}

		function _deleteSite(organizationAlias, siteAlias, callback) {
			var selector = { 'organization': organizationAlias, 'alias': siteAlias };
			var options = { safe: true };

			self.dataService.db.collection(DB_COLLECTION_SITES).remove(selector, options,
				function(error, numRecords) {
					if (error) { return callback && callback(error); }
					if (numRecords === 0) {
						error = new Error();
						error.status = 404;
						return callback && callback(error);
					}
					return callback && callback(null);
				}
			);
		}


		function _failValidation(message, callback) {
			var error = new Error(message);
			error.status = 400;
			return callback && callback(error);
		}
	};


	function _parseSiteModel(siteModel, callback) {
		_validateSiteModel(siteModel, _handleSiteModelValidated);


		function _handleSiteModelValidated(error, siteModel) {
			if (error) { return callback && callback(error); }
			var parsedModelFields = _parseModelFields(siteModel);
			return callback && callback(null, parsedModelFields);
		}

		function _parseModelFields(siteModel) {
			return {
				'organization': siteModel.organization,
				'alias': siteModel.alias,
				'name': siteModel.name,
				'title': siteModel.title,
				'template': siteModel.template,
				'share': siteModel.share || null,
				'public': Boolean(siteModel['public']),
				'users': siteModel.users || [],
				'cache': null
			};
		}
	}

	function _validateSiteModel(siteModel, callback) {
		if (!siteModel) { return _failValidation('No site model specified', callback); }
		if (!siteModel.organization) { return _failValidation('No organization specified', callback); }
		if (!siteModel.alias) { return _failValidation('No site alias specified', callback); }
		if (!siteModel.name) { return _failValidation('No site name specified', callback); }
		if (!siteModel.title) { return _failValidation('No site title specified', callback); }
		if (!siteModel.template) { return _failValidation('No site template specified', callback); }

		// TODO: Validate organization when validating site model
		// TODO: Validate alias when validating site model
		// TODO: Validate name when validating site model
		// TODO: Validate title when validating site model
		// TODO: Validate template when validating site model
		// TODO: Validate share when validating site model
		
		return callback && callback(null, siteModel);


		function _failValidation(message, callback) {
			var error = new Error(message);
			error.status = 400;
			return callback && callback(error);
		}
	}


	SiteService.prototype._loadFolderContents = function(folderPath, folderCache, downloadUrlPrefix, callback) {
		var cacheCursor = (folderCache && folderCache.cursor) || null;
		var cacheRoot = (folderCache && folderCache.data) || null;
		var cacheUpdated = (folderCache && folderCache.updated) || null;

		var needsUpdate = _needsUpdate(cacheUpdated, DROPBOX_DELTA_CACHE_EXPIRY);
		if (!needsUpdate) {
			var folderCacheContents = this._getFolderCacheContents(folderCache, folderPath, downloadUrlPrefix);
			return callback && callback(null, folderCacheContents, folderCache);
		}

		var self = this;
		this.dropboxService.client.delta(cacheCursor || 0, folderPath, _handleDeltaLoaded);


		function _needsUpdate(lastUpdated, cacheDuration) {
			if (!lastUpdated) { return true; }
			var delta = (new Date() - lastUpdated);
			return (delta > cacheDuration);
		}


		function _handleDeltaLoaded(error, pulledChanges) {
			if (error) { return callback && callback(error); }

			cacheCursor = pulledChanges.cursorTag;

			var cachePathLookupTable = _getCacheDictionary(cacheRoot, pulledChanges, folderPath);
			cacheRoot = cachePathLookupTable[folderPath.toLowerCase()];

			pulledChanges.changes.forEach(function(changeModel) {
				var changePath = changeModel.path.toLowerCase();

				var parentPath = changePath.substr(0, changePath.lastIndexOf('/')).toLowerCase();
				var parentFolder = cachePathLookupTable[parentPath] || null;

				if (changeModel.wasRemoved) {
					parentFolder.contents = parentFolder.contents.filter(function(siblingFolder) {
						return siblingFolder.path.toLowerCase() !== changePath;
					});
				} else {
					var fileModel = changeModel.stat.json();
					if (fileModel.is_dir) { fileModel.contents = []; }
					if (parentFolder) {
						parentFolder.contents.push(fileModel);
					}
					cachePathLookupTable[changePath] = fileModel;
				}
			});

			if (pulledChanges.shouldPullAgain) {
				self.dropboxService.client.delta(cacheCursor, folderPath, _handleDeltaLoaded);
			} else {
				var updatedFolderCache = {
					updated: new Date(),
					cursor: cacheCursor,
					data: cacheRoot
				};
				var folderCacheContents = self._getFolderCacheContents(updatedFolderCache, folderPath, downloadUrlPrefix);
				return callback && callback(null, folderCacheContents, updatedFolderCache);
			}

			function _getCacheDictionary(cacheRoot, pulledChanges, folderPath) {
				var cacheDictionary;
				cacheRoot = _updateCacheRoot(cacheRoot, pulledChanges, folderPath);
				cacheDictionary = _buildCacheDictionary(cacheRoot);
				_addItemToCache(cacheRoot, cacheDictionary);

				return cacheDictionary;


				function _buildCacheDictionary(cacheRoot, cacheDictionary) {
					cacheDictionary = cacheDictionary || {};
					if (!cacheRoot) { return cacheDictionary; }
					_addItemToCache(cacheRoot, cacheDictionary);
					if (cacheRoot.contents) {
						cacheDictionary = cacheRoot.contents.reduce(function(cacheDictionary, cacheEntry) {
							return _buildCacheDictionary(cacheEntry, cacheDictionary);
						}, cacheDictionary);
					}
					return cacheDictionary;
				}
			}


			function _updateCacheRoot(cacheRoot, pulledChanges, folderPath) {
				if (pulledChanges.blankSlate) { cacheRoot = null; }
				pulledChanges.changes.forEach(function(changeModel) {
					var isRootFolder = _isRootFolder(changeModel, folderPath);
					if (!isRootFolder) { return; }
					if (changeModel.wasRemoved) {
						cacheRoot = null;
					} else {
						cacheRoot = _getFileModel(changeModel);
					}
				});
				return cacheRoot;
			}

			function _addItemToCache(cacheItem, cacheDictionary) {
				return (cacheDictionary[cacheItem.path.toLowerCase()] = cacheItem);
			}

			function _isRootFolder(changeModel, folderPath) {
				return (changeModel.path.toLowerCase() === folderPath.toLowerCase());
			}

			function _getFileModel(changeModel) {
				var fileModel = changeModel.stat.json();
				if (fileModel.is_dir) { fileModel.contents = []; }
				return fileModel;
			}
		}
	};

	SiteService.prototype._getFolderCacheContents = function(cache, rootFolderPath, downloadUrlPrefix) {
		return getFileMetadata(cache.data, rootFolderPath, downloadUrlPrefix);


		function getFileMetadata(statModel, rootFolderPath, downloadUrlPrefix) {
			var fileMetadata = {};

			for (var property in statModel) {
				if (!statModel.hasOwnProperty(property)) { continue; }
				if (property.charAt(0) === '_') { continue; }
				if (property === 'contents') {
					fileMetadata.contents = statModel.contents.map(function(childStatModel) {
						return getFileMetadata(childStatModel, rootFolderPath, downloadUrlPrefix);
					});
					continue;
				}
				fileMetadata[property] = statModel[property];
			}

			fileMetadata.name = fileMetadata.path.split('/').pop();
			fileMetadata.alias = fileMetadata.name.toLowerCase().replace(/[^a-z0-9_]+/g, '-');
			fileMetadata.label = fileMetadata.name.replace(/^[0-9]+[ \.\-\|]*/, '');
			if (!fileMetadata.is_dir) {
				fileMetadata.extension = fileMetadata.label.split('.').pop();
				fileMetadata.label = fileMetadata.label.substr(0, fileMetadata.label.lastIndexOf('.'));
			}
			fileMetadata.url = fileMetadata.path.replace(rootFolderPath, downloadUrlPrefix);
			fileMetadata.date = formatDate(new Date(fileMetadata.modified));

			Object.defineProperty(fileMetadata, 'folders', {
				'get': function() {
					return (this.contents ? this.contents.filter(function(fileModel) { return fileModel.is_dir; }) : null);
				}
			});

			Object.defineProperty(fileMetadata, 'files', {
				'get': function() {
					return (this.contents ? this.contents.filter(function(fileModel) { return !fileModel.is_dir; }) : null);
				}
			});

			return fileMetadata;
		}

		function formatDate(date) {
			var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
			var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dev'];
			return DAYS[date.getDay()] + ' ' + date.getDate() + ' ' + MONTHS[date.getMonth()] + ' ' + date.getFullYear();
		}
	};

	return SiteService;
})();
