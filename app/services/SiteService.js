module.exports = (function() {
	'use strict';

	var DownloadService = require('../services/DownloadService');

	var SECONDS = 1000;
	var MINUTES = SECONDS * 60;
	var DROPBOX_DELTA_CACHE_EXPIRY = 5 * MINUTES;

	var SITE_FOLDER_PATH_FORMAT = '/.dropkick/sites/${SITE_OWNER}/${SITE_NAME}';
	var SITE_CONTENTS_DOWNLOAD_URL_PREFIX = 'download';

	var DB_COLLECTION_SITES = 'sites';

	function SiteService(dataService, dropboxService, siteUser, siteName) {
		this.dataService = dataService;
		this.dropboxService = dropboxService;
		this.siteUser = siteUser;
		this.siteName = siteName;
	}

	SiteService.prototype.dataService = null;
	SiteService.prototype.dropboxService = null;
	SiteService.prototype.siteUser = null;
	SiteService.prototype.siteName = null;

	SiteService.prototype.getFolderPath = function() {
		return SITE_FOLDER_PATH_FORMAT
			.replace(/\$\{SITE_OWNER\}/g, this.siteUser)
			.replace(/\$\{SITE_NAME\}/g, this.siteName);
	};

	SiteService.prototype.retrieveDownloadLink = function(downloadPath, callback) {
		var downloadService = new DownloadService(this.dropbox);
		var dropboxFilePath = this.getFolderPath() + '/' + downloadPath;
		downloadService.retrieveDownloadLink(dropboxFilePath, _handleDownloadLinkRetrieved);

		function _handleDownloadLinkRetrieved(error, downloadUrl) {
			if (error) { return callback && callback(error); }
			return callback && callback(null, downloadUrl);
		}
	};

	SiteService.prototype.getAuthenticationDetails = function(callback) {
		var query = { 'username': this.siteUser, 'site': this.siteName };
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

	SiteService.prototype.retrieveSite = function(includeContents, callback) {
		var query = { 'username': this.siteUser, 'site': this.siteName };
		var projection = { '_id': 0, 'public': 0, 'users': 0 };
		if (!includeContents) { projection['cache'] = 0; }

		var self = this;
		this.dataService.db.collection(DB_COLLECTION_SITES).findOne(query, projection,
			function(error, siteModel) {
				if (error) { return callback && callback(error); }
				if (!includeContents) { return callback && callback(null, siteModel); }

				var siteFolderPath = self.getFolderPath();
				var downloadUrlPrefix = SITE_CONTENTS_DOWNLOAD_URL_PREFIX;

				self._loadFolderContents(siteFolderPath, siteModel.cache, downloadUrlPrefix, _handleSiteContentsLoaded);


				function _handleSiteContentsLoaded(error, siteContents, siteCache) {
					if (error) { return callback && callback(error); }
					siteModel.contents = siteContents;
					delete siteModel.cache;
					self.updateSiteCache(siteCache);
					return callback && callback(null, siteModel);
				}
			}
		);
	};

	SiteService.prototype._loadFolderContents = function(folderPath, folderCache, downloadUrlPrefix, callback) {
		var cacheCursor = (folderCache && folderCache.cursor) || null;
		var cacheRoot = (folderCache && folderCache.data) || null;
		var cacheUpdated = (folderCache && folderCache.updated) || 0;

		var timeSinceLastUpdate = (new Date() - cacheUpdated);
		if (timeSinceLastUpdate < DROPBOX_DELTA_CACHE_EXPIRY) {
			var folderCacheContents = this._getFolderCacheContents(folderCache, folderPath, downloadUrlPrefix);
			return callback && callback(null, folderCacheContents, folderCache);
		}

		var self = this;
		this.dropboxService.client.delta(cacheCursor, folderPath, _handleDeltaLoaded);


		function _handleDeltaLoaded(error, pulledChanges) {
			if (error) { return callback && callback(error); }

			cacheCursor = pulledChanges.cursorTag;

			var cachePathLookupTable;
			if (pulledChanges.blankSlate) {
				cacheRoot = null;
				cachePathLookupTable = {};
			} else {
				cachePathLookupTable = _getCacheDictionary({}, cacheRoot);
			}

			pulledChanges.changes.forEach(function(changeModel) {
				var changePath = changeModel.path.toLowerCase();

				var parentPath = changePath.substr(0, changePath.lastIndexOf('/')).toLowerCase();
				var parentFolder = cachePathLookupTable[parentPath] || null;
				var isRootFolder = (changePath === folderPath.toLowerCase());

				if (changeModel.wasRemoved) {
					if (isRootFolder) { cacheRoot = null; }
					parentFolder.contents = parentFolder.contents.filter(function(siblingFolder) {
						return siblingFolder.path.toLowerCase() !== changePath;
					});
				} else {
					var fileModel = changeModel.stat.json();
					if (fileModel.is_dir) { fileModel.contents = []; }
					if (isRootFolder) {
						cacheRoot = fileModel;
					} else {
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


			function _getCacheDictionary(cachePathLookupTable, cacheItem) {
				cachePathLookupTable[cacheItem.path.toLowerCase()] = cacheItem;
				if (cacheItem.contents) {
					cachePathLookupTable = cacheItem.contents.reduce(_getCacheDictionary, cachePathLookupTable);
				}
				return cachePathLookupTable;
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

	SiteService.prototype.retrieveSiteCache = function(callback) {
		var query = { 'username': this.siteUser, 'site': this.siteName };
		var projection = { 'cache': 1 };

		this.dataService.db.collection(DB_COLLECTION_SITES).findOne(query, projection,
			function(error, siteModel) {
				if (error) { return callback && callback(error); }
				return callback && callback(null, siteModel.cache);
			}
		);
	};

	SiteService.prototype.updateSiteCache = function(cache, callback) {
		cache = cache || null;

		var query = { 'username': this.siteUser, 'site': this.siteName };
		var update = { $set: { 'cache': cache } };
		var options = { w: 1 };

		this.dataService.db.collection(DB_COLLECTION_SITES).update(query, update, options,
			function(error, result) {
				if (error) { return callback && callback(error); }
				return callback && callback(null, result);
			}
		);
	};

	return SiteService;
})();
