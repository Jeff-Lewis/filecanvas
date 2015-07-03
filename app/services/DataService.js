'use strict';

var Promise = require('promise');
var mongodb = require('mongodb');
var MongoClient = mongodb.MongoClient;
var objectAssign = require('object-assign');

function DataService() {
}

DataService.prototype.ERROR_CODE_DUPLICATE_KEY = 11000;

DataService.prototype.db = null;
DataService.prototype.connecting = false;

DataService.prototype.connect = function(uri) {
	var self = this;
	return new Promise(function(resolve, reject) {
		if (self.connecting) { throw new Error('Connection attempt already in progress'); }
		if (self.db) { throw new Error('Already connected'); }

		self.connecting = true;

		MongoClient.connect(uri, function(error, db) {
			self.connecting = false;
			if (error) { return reject(error); }
			self.db = db;
			return resolve(db);
		});
	});
};

DataService.prototype.collection = function(collectionName) {
	if (!this.db) { throw new Error('Not connected'); }
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
			function(error, domainModels) {
				if (error) { return reject(error); }
				return resolve(domainModels);
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
	var collection = this.collection;
	return new Promise(function(resolve, reject) {
		collection.updateOne(filter, updates,
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
		collection.deleteOne(filter,
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
		collection.deleteMany(filter,
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
		collection.count(query,
			function(error, numRecords) {
				if (error) { return reject(error); }
				return resolve(numRecords);
			}
		);
	});

};

module.exports = DataService;
