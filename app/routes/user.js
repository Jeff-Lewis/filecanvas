module.exports = (function() {
	'use strict';

	var express = require('express');
	var templates = require('../templates');
	var DropboxService = require('../services/DropboxService');
	var DataService = require('../services/DataService');

	var app = express();

	app.get('/:username/:app', function(req, res, next) {
		var username = req.params.username;
		var appName = req.params.app;

		var includeCache = false;
		DataService.retrieveApp(username, appName, includeCache, _handleAppModelLoaded);


		function _handleAppModelLoaded(error, appModel) {
			if (error) { return next(error); }
			appModel = appModel;

			var templateName = appModel.template;
			console.log(JSON.stringify(appModel, null, '\t'));
			var title = appModel.title;
			var depth = appModel.depth;

			var userPathPrefix = '/.dropkick/users/' + username + '/';
			var appFolderPath = userPathPrefix + appName;

			loadFolderListing(appFolderPath, depth, _handleFolderListingLoaded);

			function _handleFolderListingLoaded(error, statModel) {
				if (error) { return next(error); }

				var templateData = getTemplateData(statModel, userPathPrefix, '/downloads/');

				var template = templates[templateName];
				var html = template({
					title: title,
					templateRoot: '/templates/' + templateName + '/',
					contents: templateData.contents,
					folders: templateData.folders,
					files: templateData.files
				});
				res.send(html);
			}
		}


	});

	return app;

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

		templateData.alias = templateData.name.toLowerCase().replace(/[^a-z0-9_]+/g, '-');
		templateData.label = templateData.name.replace(/^[0-9]+[ \.\-\|]*/, '');
		if (templateData.isFile) {
			templateData.extension = templateData.label.split('.').pop();
			templateData.label = templateData.label.substr(0, templateData.label.lastIndexOf('.'));
		}
		templateData.url = templateData.path.replace(pathPrefix, urlPrefix);
		templateData.humanDate = formatDate(templateData.modifiedAt);

		if (templateData.contents) {
			templateData.folders = templateData.contents.filter(function(fileModel) { return fileModel.isFolder; });
			templateData.files = templateData.contents.filter(function(fileModel) { return fileModel.isFile; });
		} else {
			templateData.contents = null;
			templateData.folders = null;
			templateData.files = null;
		}

		return templateData;
	}


	function loadFolderListing(path, depth, callback) {
		var options = { readDir: true };
		DropboxService.client.stat(path, options, _handleFolderStatLoaded);

		function _handleFolderStatLoaded(error, statModel, contents) {
			if (error) { return callback(error); }

			statModel.contents = contents;

			var remainingChildren = 0;
			if (depth > 0) { _recurseFolderContents(contents, depth); }
			if (remainingChildren > 0) { return; }

			callback(null, statModel);


			function _recurseFolderContents(contents, depth) {
				var childFolders = contents.filter(function(childStatModel) { return childStatModel.isFolder; });
				remainingChildren++;
				childFolders.forEach(_loadChildFolderStat);
				remainingChildren--;
			}

			function _loadChildFolderStat(childStatModel) {
				remainingChildren++;
				var childFolderName = path + '/' + childStatModel.name;
				return loadFolderListing(childFolderName, depth - 1, _handleChildFolderStatLoaded);

				function _handleChildFolderStatLoaded(error, populatedChildStatModel) {
					if (error) { return callback(error); }
					childStatModel.contents = populatedChildStatModel.contents;
					if (--remainingChildren === 0) {
						callback(null, statModel);
					}
				}
			}
		}
	}

	function formatDate(date) {
		var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
		var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dev'];
		return DAYS[date.getDay()] + ' ' + date.getDate() + ' ' + MONTHS[date.getMonth()] + ' ' + date.getFullYear();
	}
})();
