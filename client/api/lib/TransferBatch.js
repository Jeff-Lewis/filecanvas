'use strict';

function TransferBatch(files) {
	this.items = files.map(function(file) {
		return createBatchItem(file);
	});
}

TransferBatch.prototype.append = function(files) {
	var items = files.map(function(file) {
		return createBatchItem(file);
	});
	this.items = this.items.concat(items);
};

TransferBatch.prototype.cancel = function() {
	this.items.forEach(function(item) {
		if (item.completed || item.error || item.started) { return; }
		item.error = new Error('Transfer canceled');
	});
};

Object.defineProperty(TransferBatch.prototype, 'length', {
	get: function() {
		return this.items.length;
	}
});

Object.defineProperty(TransferBatch.prototype, 'numLoaded', {
	get: function() {
		return this.items.reduce(function(count, item) {
			return (item.completed ? count + 1 : count);
		}, 0);
	}
});

Object.defineProperty(TransferBatch.prototype, 'numFailed', {
	get: function() {
		return this.items.reduce(function(count, item) {
			return (item.error ? count + 1 : count);
		}, 0);
	}
});

Object.defineProperty(TransferBatch.prototype, 'bytesLoaded', {
	get: function() {
		return this.items.reduce(function(count, item) {
			return count + (item.error ? 0 : item.bytesLoaded);
		}, 0);
	}
});

Object.defineProperty(TransferBatch.prototype, 'bytesTotal', {
	get: function() {
		return this.items.reduce(function(count, item) {
			return count + (item.error ? 0 : item.bytesTotal);
		}, 0);
	}
});

Object.defineProperty(TransferBatch.prototype, 'currentItem', {
	get: function() {
		return this.items.filter(function(item) {
			return item.started && !item.completed;
		})[0] || null;
	}
});

Object.defineProperty(TransferBatch.prototype, 'pendingItems', {
	get: function() {
		return this.items.filter(function(item) {
			return !item.started && !item.error;
		});
	}
});

Object.defineProperty(TransferBatch.prototype, 'completedItems', {
	get: function() {
		return this.items.filter(function(item) {
			return item.completed;
		});
	}
});

Object.defineProperty(TransferBatch.prototype, 'failedItems', {
	get: function() {
		return this.items.filter(function(item) {
			return item.error;
		});
	}
});

TransferBatch.prototype.getItemAt = function(index) {
	return this.items[index];
};

function createBatchItem(file) {
	return {
		file: file,
		filename: file.data.name,
		bytesLoaded: 0,
		bytesTotal: file.data.size,
		started: false,
		completed: false,
		error: false
	};
}

module.exports = TransferBatch;
