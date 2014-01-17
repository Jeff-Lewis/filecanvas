module.exports = (function() {
	'use strict';

	var mongodb = require('mongodb');
	var MongoClient = mongodb.MongoClient;


	function DataService(mongoUri) {
	}

	DataService.prototype.db = null;
	DataService.prototype.connecting = false;

	DataService.prototype.connect = function(config, callback) {
		if (this.connecting) { throw new Error('Connection attempt already in progress'); }
		if (this.db) { throw new Error('Already connected'); }
		this.connecting = true;

		var self = this;
		MongoClient.connect(config.uri, function(error, db) {
			self.connecting = false;
			if (error) { return callback && callback(error); }
			self.db = db;
			if (callback) { callback(null, db); }
		});
	};

	DataService.prototype.retrieveUser = function(username, callback) {
		var query = { 'username': username };

		this.db.collection('users').findOne(query,
			function(error, userModel) {
				if (error) { return callback && callback(error); }
				return callback && callback(null, userModel);
			}
		);
	};

	DataService.prototype.retrieveApp = function(username, app, includeCache, callback) {
		var query = { 'username': username, 'app': app };
		var projection = (includeCache ? {} : { 'cache': 0 });

		this.db.collection('apps').findOne(query, projection,
			function(error, appModel) {
				if (error) { return callback && callback(error); }
				return callback && callback(null, appModel);
			}
		);
	};

	DataService.prototype.retrieveAppCache = function(username, app, callback) {
		var query = { 'username': username, 'app': app };
		var projection = { 'cache': 1 };
		
		this.db.collection('apps').findOne(query, projection,
			function(error, appModel) {
				if (error) { return callback && callback(error); }
				return callback && callback(null, appModel.cache);
			}
		);
	};

	DataService.prototype.updateAppCache = function(username, app, cache, callback) {
		cache = cache || null;

		var query = { 'username': username, 'app': app };
		var update = { $set: { 'cache': cache } };
		var options = { w: 1 };
		
		this.db.collection('apps').update(query, update, options,
			function(error, result) {
				if (error) { return callback && callback(error); }
				return callback && callback(null, result);
			}
		);
	};

	return new DataService();
})();
