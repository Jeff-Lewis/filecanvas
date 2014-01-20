module.exports = (function() {
	'use strict';

	var express = require('express');

	var templates = require('../templates');
	var dropbox = require('../globals').dropbox;
	var db = require('../globals').db;

	var SiteService = require('../services/SiteService');
	var AuthenticationService = require('../services/AuthenticationService');

	var SECONDS = 1000;
	var MINUTES = SECONDS * 60;
	var DROPBOX_DELTA_CACHE_EXPIRY = 5 * MINUTES;

	var app = express();

	app.get('/:username/:site', auth, route);

	return app;


	function auth(req, res, next) {
		var siteOwner = req.params.username;
		var siteName = req.params.site;

		var siteService = new SiteService(db, siteOwner, siteName);

		siteService.getAuthenticationDetails(function(error, authentication, callback) {
			if (error) { return next(error); }

			var isPublic = authentication['public'];
			if (isPublic) { return next(); }

			express.basicAuth(function(username, password) {
				var validUsers = authentication.users;
				var authenticationService = new AuthenticationService();
				return authenticationService.authenticate(username, password, validUsers);
			})(req, res, next);
		});

	}

	function route(req, res, next) {
		var siteOwner = req.params.username;
		var siteName = req.params.site;

		var userDropboxPathPrefix = '/.dropkick/sites/' + siteOwner + '/';
		var siteFolderPath = userDropboxPathPrefix + siteName;
		var host = req.get('host').split('.').slice(req.subdomains.length).join('.');
		var templatesRoot = '//templates.' + host + '/';

		var siteService = new SiteService(db, siteOwner, siteName);

		var includeCache = true;
		siteService.retrieveSite(includeCache, _handleSiteModelLoaded);


		function _handleSiteModelLoaded(error, siteModel) {
			if (error) { return next(error); }

			loadSiteFolder(siteFolderPath, siteModel, _handleSiteFolderLoaded);


			function _handleSiteFolderLoaded(error, siteCache) {
				if (error) { return next(error); }

				var html = getSiteHtml(siteModel, siteCache.data, userDropboxPathPrefix, templatesRoot);
				res.send(html);

				siteService.updateSiteCache(siteCache);
			}
		}
	}


	function getSiteHtml(siteModel, statModel, userDropboxPathPrefix, templatesRoot) {
		var templateName = siteModel.template;
		var title = siteModel.title;
		return renderTemplate(templateName, title, statModel, userDropboxPathPrefix, templatesRoot);
	}

	function loadSiteFolder(siteFolderPath, siteModel, callback) {
		var siteCache = siteModel.cache;

		var cacheCursor = (siteCache && siteCache.cursor) || null;
		var cacheRoot = (siteCache && siteCache.data) || null;
		var cacheUpdated = (siteCache && siteCache.updated) || 0;

		var timeSinceLastUpdate = (new Date() - cacheUpdated);
		if (timeSinceLastUpdate < DROPBOX_DELTA_CACHE_EXPIRY) {
			return callback && callback(null, siteCache);
		}

		dropbox.client.delta(cacheCursor, siteFolderPath, _handleDeltaLoaded);


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
				var isSiteFolder = (changePath === siteFolderPath.toLowerCase());

				if (changeModel.wasRemoved) {
					if (isSiteFolder) { cacheRoot = null; }
					parentFolder.contents = parentFolder.contents.filter(function(siblingFolder) {
						return siblingFolder.path.toLowerCase() !== changePath;
					});
				} else {
					var fileModel = changeModel.stat.toJSON();
					if (fileModel.is_dir) { fileModel.contents = []; }
					if (isSiteFolder) {
						cacheRoot = fileModel;
					} else {
						parentFolder.contents.push(fileModel);
					}
					cachePathLookupTable[changePath] = fileModel;
				}
			});

			if (pulledChanges.shouldPullAgain) {
				dropbox.client.delta(cacheCursor, siteFolderPath, _handleDeltaLoaded);
			} else {
				var updatedCache = {
					updated: new Date(),
					cursor: cacheCursor,
					data: cacheRoot
				};
				return callback && callback(null, updatedCache);
			}


			function _getCacheDictionary(cachePathLookupTable, cacheItem) {
				cachePathLookupTable[cacheItem.path.toLowerCase()] = cacheItem;
				if (cacheItem.contents) {
					cachePathLookupTable = cacheItem.contents.reduce(_getCacheDictionary, cachePathLookupTable);
				}
				return cachePathLookupTable;
			}
		}
	}

	function renderTemplate(templateName, title, statModel, userDropboxPathPrefix, templatesRoot) {
		var template = templates[templateName];
		var templateData = getTemplateData(statModel, userDropboxPathPrefix, '/downloads');
		var templateRoot = templatesRoot + templateName + '/';


		return template({
			title: title,
			templateRoot: templateRoot,
			contents: templateData.contents,
			folders: templateData.folders,
			files: templateData.files
		});
	}

	function getTemplateData(statModel, pathPrefix, urlPrefix) {
		var templateData = {};

		for (var property in statModel) {
			if (!statModel.hasOwnProperty(property)) { continue; }
			if (property.charAt(0) === '_') { continue; }
			if (property === 'contents') {
				templateData.contents = statModel.contents.map(function(statModel) {
					return getTemplateData(statModel, pathPrefix, urlPrefix);
				});
				continue;
			}
			templateData[property] = statModel[property];
		}

		templateData.name = templateData.path.split('/').pop();
		templateData.alias = templateData.name.toLowerCase().replace(/[^a-z0-9_]+/g, '-');
		templateData.label = templateData.name.replace(/^[0-9]+[ \.\-\|]*/, '');
		if (!templateData.is_dir) {
			templateData.extension = templateData.label.split('.').pop();
			templateData.label = templateData.label.substr(0, templateData.label.lastIndexOf('.'));
		}
		templateData.url = templateData.path.replace(pathPrefix, urlPrefix);
		templateData.date = formatDate(new Date(templateData.modified));

		if (templateData.contents) {
			templateData.folders = templateData.contents.filter(function(fileModel) { return fileModel.is_dir; });
			templateData.files = templateData.contents.filter(function(fileModel) { return !fileModel.is_dir; });
		} else {
			templateData.contents = null;
			templateData.folders = null;
			templateData.files = null;
		}

		return templateData;
	}

	function formatDate(date) {
		var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
		var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dev'];
		return DAYS[date.getDay()] + ' ' + date.getDate() + ' ' + MONTHS[date.getMonth()] + ' ' + date.getFullYear();
	}
})();
