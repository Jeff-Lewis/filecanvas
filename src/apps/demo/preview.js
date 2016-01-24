'use strict';

var path = require('path');
var express = require('express');

var parseShortcutUrl = require('../../utils/parseShortcutUrl');

var HttpError = require('../../errors/HttpError');

module.exports = function(options) {
	options = options || {};
	var adapters = options.adapters || null;

	if (!adapters) { throw new Error('Missing adapters'); }

	var app = express();

	initRoutes(app);

	return app;

	function initRoutes(app) {
		app.get('/', ensureAuth, retrievePreviewRoute);
		app.get('/:root/download/*', ensureAuth, retrieveDownloadRoute);
		app.get('/:root/media/*', ensureAuth, retrievePreviewRoute);
		app.get('/:root/thumbnail/*', ensureAuth, retrieveThumbnailRoute);
		app.get('/:root/redirect/*', ensureAuth, retrieveShortcutRoute);


		function ensureAuth(req, res, next) {
			if (req.isAuthenticated()) {
				next();
			} else {
				next(new HttpError(403));
			}
		}

		function retrieveDownloadRoute(req, res, next) {
			var userModel = req.user;
			var userAdapters = userModel.adapters;
			var urlEncodedSiteRoot = req.params.root;
			var filePath = req.params[0];

			new Promise(function(resolve, reject) {
				var siteRoot = parseSiteRoot(urlEncodedSiteRoot);
				var siteAdapter = siteRoot.adapter;
				var sitePath = siteRoot.path;
				var fullPath = sitePath + '/' + filePath;
				var adapter = adapters[siteAdapter];
				var adapterOptions = userAdapters[siteAdapter];
				resolve(
					adapter.retrieveDownloadLink(fullPath, adapterOptions)
						.then(function(downloadUrl) {
							res.redirect(downloadUrl);
						})
				);
			})
			.catch(function(error) {
				next(error);
			});
		}

		function retrievePreviewRoute(req, res, next) {
			var userModel = req.user;
			var userAdapters = userModel.adapters;
			var urlEncodedSiteRoot = req.params.root;
			var filePath = req.params[0];

			new Promise(function(resolve, reject) {
				var siteRoot = parseSiteRoot(urlEncodedSiteRoot);
				var siteAdapter = siteRoot.adapter;
				var sitePath = siteRoot.path;
				var fullPath = sitePath + '/' + filePath;
				var adapter = adapters[siteAdapter];
				var adapterOptions = userAdapters[siteAdapter];
				resolve(
					adapter.retrievePreviewLink(fullPath, adapterOptions)
						.then(function(previewUrl) {
							res.redirect(previewUrl);
						})
				);
			})
			.catch(function(error) {
				next(error);
			});
		}

		function retrieveThumbnailRoute(req, res, next) {
			var userModel = req.user;
			var userAdapters = userModel.adapters;
			var urlEncodedSiteRoot = req.params.root;
			var filePath = req.params[0];

			new Promise(function(resolve, reject) {
				var siteRoot = parseSiteRoot(urlEncodedSiteRoot);
				var siteAdapter = siteRoot.adapter;
				var sitePath = siteRoot.path;
				var fullPath = sitePath + '/' + filePath;
				var adapter = adapters[siteAdapter];
				var adapterOptions = userAdapters[siteAdapter];
				resolve(
					adapter.retrieveThumbnailLink(fullPath, adapterOptions)
						.then(function(thumbnailUrl) {
							res.redirect(thumbnailUrl);
						})
				);
			})
			.catch(function(error) {
				next(error);
			});
		}

		function retrieveShortcutRoute(req, res, next) {
			var userModel = req.user;
			var userAdapters = userModel.adapters;
			var urlEncodedSiteRoot = req.params.root;
			var filePath = req.params[0];
			var fileExtension = path.extname(filePath);

			new Promise(function(resolve, reject) {
				var siteRoot = parseSiteRoot(urlEncodedSiteRoot);
				var siteAdapter = siteRoot.adapter;
				var sitePath = siteRoot.path;
				var fullPath = sitePath + '/' + filePath;
				var adapter = adapters[siteAdapter];
				var adapterOptions = userAdapters[siteAdapter];
				resolve(
					adapter.readFile(fullPath, adapterOptions)
						.then(function(shortcutData) {
							var shortcutType = fileExtension.substr('.'.length);
							return parseShortcutUrl(shortcutData, { type: shortcutType });
						})
						.then(function(downloadUrl) {
							res.redirect(downloadUrl);
						})
				);
			})
			.catch(function(error) {
				next(error);
			});
		}

		function parseSiteRoot(urlEncodedSiteRoot) {
			if (!urlEncodedSiteRoot) { throw new HttpError(400); }
			var serializedSiteRoot = decodeURIComponent(urlEncodedSiteRoot);
			var adapter = serializedSiteRoot.split(':')[0];
			var path = serializedSiteRoot.split(':')[1];
			if (!adapter || !path || (path.charAt(0) !== '/')) { throw new HttpError(400); }
			return {
				adapter: adapter,
				path: path
			};
		}
	}
};
