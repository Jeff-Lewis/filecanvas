module.exports = (function() {
	'use strict';

	var mongodb = require('mongodb');
	var MongoClient = mongodb.MongoClient;


	function DataService() {
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

	return DataService;
})();
