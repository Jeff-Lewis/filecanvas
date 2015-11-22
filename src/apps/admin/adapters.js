'use strict';

var express = require('express');

var SiteService = require('../../services/SiteService');

module.exports = function(database, options) {
	options = options || {};
	var host = options.host || null;
	var adapters = options.adapters || null;
	var sessionMiddleware = options.sessionMiddleware || null;

	if (!host) { throw new Error('Missing host name'); }
	if (!adapters) { throw new Error('Missing adapters'); }
	if (!sessionMiddleware) { throw new Error('Missing session middleware'); }

	var siteService = new SiteService(database, {
		host: host,
		adapters: adapters
	});

	var app = express();

	initRoutes(app, sessionMiddleware);

	return app;


	function initRoutes(app, sessionMiddleware) {
		app.get('/:adapter/metadata/*', sessionMiddleware, retrieveFileMetadataRoute);


		function retrieveFileMetadataRoute(req, res, next) {
			var userModel = req.user;
			var username = userModel.username;
			var adapter = req.params.adapter;
			var filePath = req.params[0];

			new Promise(function(resolve, reject) {
				return resolve(
					siteService.retrieveFileMetadata(username, adapter, filePath)
						.then(function(metadata) {
							res.json(metadata);
						})
						.catch(function(error) {
							if (error.status === 404) {
								res.json(null);
							} else {
								throw error;
							}
						})
				);
			})
			.catch(function(error) {
				next(error);
			});
		}

	}
};
