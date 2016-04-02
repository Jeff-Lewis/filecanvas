'use strict';

var assert = require('assert');
var mongodb = require('mongodb');
var MongoClient = mongodb.MongoClient;

var MongoStore = require('../stores/MongoStore');

function DatabaseService() {
}

DatabaseService.prototype.database = null;
DatabaseService.prototype.connectionAttempt = null;

DatabaseService.prototype.connect = function(uri) {
	assert(uri, 'Missing URI');

	if (this.database) { return Promise.resolve(this.database); }
	if (this.connectionAttempt) { return Promise.resolve(this.connectionAttempt); }

	var self = this;
	this.connectionAttempt =
		new Promise(function(resolve, reject) {
			MongoClient.connect(uri, function(error, db) {
				if (error) { return reject(error); }
				var database = new MongoStore(db);
				return resolve(database);
			});
		})
		.then(function(database) {
			self.database = database;
			self.connectionAttempt = null;
			return database;
		})
		.catch(function(error) {
			self.database = null;
			self.connectionAttempt = null;
			throw error;
		});
	return this.connectionAttempt;
};

module.exports = DatabaseService;
