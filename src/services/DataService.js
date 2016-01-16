'use strict';

var mongodb = require('mongodb');
var MongoClient = mongodb.MongoClient;
var objectAssign = require('object-assign');

function DataService() {
}

DataService.prototype.database = null;
DataService.prototype.connectionAttempt = null;

DataService.prototype.connect = function(uri) {
	if (this.database) { return Promise.resolve(this.database); }
	if (this.connectionAttempt) { return Promise.resolve(this.connectionAttempt); }
	var self = this;
	this.connectionAttempt =
		new Promise(function(resolve, reject) {
			MongoClient.connect(uri, function(error, db) {
				if (error) { return reject(error); }
				var database = new Database(db);
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

function Database(db) {
	this.db = db;
}

Database.prototype.db = null;

Database.prototype.ERROR_CODE_DUPLICATE_KEY = 11000;

Database.prototype.collection = function(collectionName) {
	return new Collection(this.db, collectionName);
};

function Collection(db, collectionName) {
	this.collection = db.collection(collectionName);
	this.name = collectionName;
}

Collection.prototype.insertOne = function(document, options) {
	options = options || {};
	var collection = this.collection;
	return new Promise(function(resolve, reject) {
		collection.insertOne(document, options,
			function(error, results) {
				if (error) { return reject(error); }
				return resolve();
			}
		);
	});
};

Collection.prototype.find = function(filter, fields, options) {
	fields = fields || [];
	var fieldOptions = fields.reduce(function(fieldOptions, field) {
		fieldOptions[field] = 1;
		return fieldOptions;
	}, {});
	options = objectAssign({}, { fields: fieldOptions }, options);
	var collection = this.collection;
	return new Promise(function(resolve, reject) {
		collection.find(filter, options).toArray(
			function(error, documents) {
				if (error) { return reject(error); }
				return resolve(documents);
			}
		);
	});
};

Collection.prototype.findOne = function(query, fields, options) {
	fields = fields || [];
	var fieldOptions = fields.reduce(function(fieldOptions, field) {
		fieldOptions[field] = 1;
		return fieldOptions;
	}, {});
	options = objectAssign({}, { fields: fieldOptions }, options);
	var collection = this.collection;
	return new Promise(function(resolve, reject) {
		collection.findOne(query, options,
			function(error, document) {
				if (error) { return reject(error); }
				return resolve(document);
			}
		);
	});
};

Collection.prototype.updateOne = function(filter, updates, options) {
	options = options || {};
	updates = parseUpdates(updates);
	if (!updates) { return Promise.resolve(); }
	var collection = this.collection;
	return new Promise(function(resolve, reject) {
		collection.updateOne(filter, updates, options,
			function(error, results) {
				if (error) { return reject(error); }
				var numRecords = results.result.n;
				return resolve(numRecords);
			}
		);
	});
};

Collection.prototype.updateMany = function(filter, updates, options) {
	options = objectAssign(options || {}, { multi: true });
	updates = parseUpdates(updates);
	if (!updates) { return Promise.resolve(); }
	var collection = this.collection;
	return new Promise(function(resolve, reject) {
		collection.updateMany(filter, updates, options,
			function(error, results) {
				if (error) { return reject(error); }
				var numRecords = results.result.n;
				return resolve(numRecords);
			}
		);
	});
};

Collection.prototype.deleteOne = function(filter, options) {
	options = options || {};
	var collection = this.collection;
	return new Promise(function(resolve, reject) {
		collection.deleteOne(filter, options,
			function(error, results) {
				if (error) { return reject(error); }
				var numRecords = results.result.n;
				return resolve(numRecords);
			}
		);
	});
};

Collection.prototype.deleteMany = function(filter, options) {
	options = options || {};
	var collection = this.collection;
	return new Promise(function(resolve, reject) {
		collection.deleteMany(filter, options,
			function(error, results) {
				if (error) { return reject(error); }
				var numRecords = results.result.n;
				return resolve(numRecords);
			}
		);
	});
};

Collection.prototype.count = function(query, options) {
	options = options || {};
	var collection = this.collection;
	return new Promise(function(resolve, reject) {
		collection.count(query, options,
			function(error, numRecords) {
				if (error) { return reject(error); }
				return resolve(numRecords);
			}
		);
	});
};

function parseUpdates(updates) {
	updates = objectAssign({}, updates);
	var updateOperators = ['$inc', '$mul', '$rename', '$setOnInsert', '$set', '$unset', '$min', '$max', '$currentDate'];
	updateOperators.forEach(function(operator) {
		if ((operator in updates) && (!operator || (Object.keys(updates[operator]).length === 0))) {
			delete updates[operator];
		}
	});
	if (Object.keys(updates).length === 0) {
		updates = null;
	}
	return updates;
}

module.exports = DataService;
