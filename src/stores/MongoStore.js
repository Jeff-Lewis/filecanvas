'use strict';

var assert = require('assert');
var objectAssign = require('object-assign');

function MongoStore(db) {
	this.db = db;
}

MongoStore.prototype.db = null;

MongoStore.prototype.ERROR_CODE_DUPLICATE_KEY = 11000;

MongoStore.prototype.collection = function(collectionName) {
	assert(collectionName, 'Missing collection name');

	return new MongoCollection(this.db, collectionName);
};

function MongoCollection(db, collectionName) {
	this.collection = db.collection(collectionName);
	this.name = collectionName;
}

MongoCollection.prototype.insertOne = function(document, options) {
	options = options || {};

	try {
		assert(document, 'Missing document');
	} catch (error) {
		return Promise.reject(error);
	}

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

MongoCollection.prototype.find = function(filter, fields, options) {
	fields = fields || [];
	var fieldOptions = fields.reduce(function(fieldOptions, field) {
		fieldOptions[field] = 1;
		return fieldOptions;
	}, {});
	options = objectAssign({}, { fields: fieldOptions }, options);

	try {
		assert(filter, 'Missing filter');
	} catch (error) {
		return Promise.reject(error);
	}

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

MongoCollection.prototype.findOne = function(query, fields, options) {
	fields = fields || [];
	var fieldOptions = fields.reduce(function(fieldOptions, field) {
		fieldOptions[field] = 1;
		return fieldOptions;
	}, {});
	options = objectAssign({}, { fields: fieldOptions }, options);

	try {
		assert(query, 'Missing query');
	} catch (error) {
		return Promise.reject(error);
	}

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

MongoCollection.prototype.updateOne = function(filter, updates, options) {
	options = options || {};
	updates = parseUpdates(updates);

	try {
		assert(filter, 'Missing filter');
	} catch (error) {
		return Promise.reject(error);
	}

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

MongoCollection.prototype.updateMany = function(filter, updates, options) {
	options = objectAssign(options || {}, { multi: true });
	updates = parseUpdates(updates);

	try {
		assert(filter, 'Missing filter');
	} catch (error) {
		return Promise.reject(error);
	}

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

MongoCollection.prototype.deleteOne = function(filter, options) {
	options = options || {};

	try {
		assert(filter, 'Missing filter');
	} catch (error) {
		return Promise.reject(error);
	}

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

MongoCollection.prototype.deleteMany = function(filter, options) {
	options = options || {};

	try {
		assert(filter, 'Missing filter');
	} catch (error) {
		return Promise.reject(error);
	}

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

MongoCollection.prototype.count = function(query, options) {
	options = options || {};

	try {
		assert(query, 'Missing query');
	} catch (error) {
		return Promise.reject(error);
	}

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

module.exports = MongoStore;


function parseUpdates(updates) {
	updates = objectAssign({}, updates);
	var updateOperators = ['$inc', '$mul', '$rename', '$setOnInsert', '$set', '$unset', '$min', '$max', '$currentDate'];
	updateOperators.forEach(function(operator) {
		if ((operator in updates) && (!updates[operator] || (Object.keys(updates[operator]).length === 0))) {
			delete updates[operator];
		}
	});
	if (Object.keys(updates).length === 0) {
		updates = null;
	}
	return updates;
}
