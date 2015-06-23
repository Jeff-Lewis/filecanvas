'use strict';

var Promise = require('promise');
var mongodb = require('mongodb');
var MongoClient = mongodb.MongoClient;

function DataService() {
}

DataService.prototype.db = null;
DataService.prototype.connecting = false;

DataService.prototype.connect = function(config) {
	var self = this;
	return new Promise(function(resolve, reject) {
		if (self.connecting) { throw new Error('Connection attempt already in progress'); }
		if (self.db) { throw new Error('Already connected'); }

		self.connecting = true;

		MongoClient.connect(config.uri, function(error, db) {
			self.connecting = false;
			if (error) { return reject(error); }
			self.db = db;
			return resolve(db);
		});
	});
};

module.exports = DataService;
