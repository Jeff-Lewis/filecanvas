module.exports = (function() {
	'use strict';

	var express = require('express');
	var templates = require('../templates');
	var DropboxService = require('../services/DropboxService');

	var app = express();

	app.get('/:username/:folder', function(req, res, next) {
		var username = req.params.username;
		var folder = req.params.folder;

		var templateName = 'default';
		var title = username + '’s folder | webfolder.io';
		var depth = 2;

		loadFolderListing(username, folder, depth, function(error, stat) {
			if (error) { return next(error); }
			var template = templates[templateName];
			var html = template({
				title: title,
				templateRoot: '/templates/' + templateName + '/',
				contents: stat.contents,
				directories: stat.directories,
				assets: stat.assets
			});
			res.send(html);
		});
	});

	return app;


	function loadFolderListing(user, folder, depth, callback) {
		var pathPrefix = '/.webfolder/users/' + user + '/';
		var path = pathPrefix + folder;
		var options = { readDir: true };
		DropboxService.client.stat(path, options, _handleFolderStatLoaded);

		function _handleFolderStatLoaded(error, stat, contents) {
			if (error) { return callback(error); }

			stat.contents = contents;
			stat.directories = contents.filter(function(fileStat) { return fileStat.isFolder; });
			stat.assets = contents.filter(function(fileStat) { return fileStat.isFile; });

			contents.forEach(function(fileStat) {
				fileStat.alias = fileStat.name.toLowerCase().replace(/[^a-z0-9_]+/g, '-');
				fileStat.label = fileStat.name.replace(/^[0-9]+[ \.\-\|]*/, '');
				if (fileStat.isFile) {
					fileStat.extension = fileStat.label.split('.').pop();
					fileStat.label = fileStat.label.substr(0, fileStat.label.lastIndexOf('.'));
				}
				fileStat.url = '/download/' + fileStat.path.replace(pathPrefix, '');
				fileStat.humanDate = formatDate(fileStat.modifiedAt);
			});

			var remainingChildren = 0;
			if (depth > 0) { _recurseFolderContents(contents, depth); }
			if (remainingChildren > 0) { return; }

			callback(null, stat);


			function _recurseFolderContents(contents, depth) {
				var childFolders = contents.filter(function(childStat) { return childStat.isFolder; });
				remainingChildren++
				childFolders.forEach(_loadChildFolderStat);
				remainingChildren--;
			}

			function _loadChildFolderStat(childStat) {
				remainingChildren++;
				var childFolderName = folder + '/' + childStat.name;
				return loadFolderListing(user, childFolderName, depth - 1, _handleChildFolderStatLoaded);

				function _handleChildFolderStatLoaded(error, populatedChildStat) {
					if (error) { return callback(error); }
					childStat.contents = populatedChildStat.contents;
					childStat.directories = populatedChildStat.directories;
					childStat.assets = populatedChildStat.assets;
					if (--remainingChildren === 0) {
						callback(null, stat);
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
