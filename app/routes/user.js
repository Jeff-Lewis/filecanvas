module.exports = (function() {
	'use strict';

	var express = require('express');
	var templates = require('../templates');
	var DropboxService = require('../services/DropboxService');
	var DataService = require('../services/DataService');

	var SECONDS = 1000;
	var MINUTES = SECONDS * 60;
	var DROPBOX_DELTA_CACHE_EXPIRY = 5 * MINUTES;

	var app = express();

	app.get('/:username/:app', function(req, res, next) {
		var username = req.params.username;
		var appName = req.params.app;

		var userPathPrefix = '/.dropkick/users/' + username + '/';

		var includeCache = true;
		DataService.retrieveApp(username, appName, includeCache, _handleAppModelLoaded);


		function _handleAppModelLoaded(error, appModel) {
			if (error) { return next(error); }

			loadAppFolder(username, appName, appModel, userPathPrefix, _handleAppFolderLoaded);


			function _handleAppFolderLoaded(error, appCache) {
				if (error) { return next(error); }

				var html = getAppHtml(appModel, appCache.data, userPathPrefix);
				res.send(html);

				cacheAppFolder(appCache, username, appName);
			}
		}
	});

	return app;


	function getAppHtml(appModel, statModel, userPathPrefix) {
		var templateName = appModel.template;
		var title = appModel.title;
		return renderTemplate(templateName, title, statModel, userPathPrefix);
	}

	function loadAppFolder(username, appName, appModel, userPathPrefix, callback) {
		var appFolderPath = userPathPrefix + appName;
		var appCache = appModel.cache;

		var cacheCursor = (appCache && appCache.cursor) || null;
		var cacheRoot = (appCache && appCache.data) || null;
		var cacheUpdated = (appCache && appCache.updated) || 0;

		var timeSinceLastUpdate = (new Date() - cacheUpdated);
		if (timeSinceLastUpdate < DROPBOX_DELTA_CACHE_EXPIRY) {
			return callback && callback(null, appCache);
		}

		DropboxService.client.delta(cacheCursor, appFolderPath, _handleDeltaLoaded);


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
				var isAppFolder = (changePath === appFolderPath.toLowerCase());

				if (changeModel.wasRemoved) {
					if (isAppFolder) { cacheRoot = null; }
					parentFolder.contents = parentFolder.contents.filter(function(siblingFolder) {
						return siblingFolder.path.toLowerCase() !== changePath;
					});
				} else {
					var fileModel = changeModel.stat.toJSON();
					if (fileModel.is_dir) { fileModel.contents = []; }
					if (isAppFolder) {
						cacheRoot = fileModel;
					} else {
						parentFolder.contents.push(fileModel);
					}
					cachePathLookupTable[changePath] = fileModel;
				}
			});

			if (pulledChanges.shouldPullAgain) {
				DropboxService.client.delta(cacheCursor, appFolderPath, _handleDeltaLoaded);
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

	function cacheAppFolder(appCache, username, appName, callback) {
		DataService.updateAppCache(username, appName, appCache, callback);
	}

	function renderTemplate(templateName, title, statModel, userPathPrefix) {
		var template = templates[templateName];
		var templateData = getTemplateData(statModel, userPathPrefix, '/downloads');
		var templateRoot = '/templates/' + templateName + '/';


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
