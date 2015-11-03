'use strict';

function HistoryStack() {
	this.states = [];
}

HistoryStack.prototype.states = null;
HistoryStack.prototype.index = -1;

HistoryStack.prototype.add = function(state) {
	this.states[this.index + 1] = state;
	this.index++;
	this.states.length = this.index + 1;
};

HistoryStack.prototype.replace = function(state) {
	if (this.index === -1) {
		this.index = 0;
	}
	this.states[this.index] = state;
	this.states.length = this.index + 1;
};

HistoryStack.prototype.previous = function() {
	if (this.index <= 0) {
		throw new Error('Already at first state');
	}
	this.index--;
};

HistoryStack.prototype.next = function() {
	if (this.index >= this.states.length - 1) {
		throw new Error('Already at last state');
	}
	this.index++;
};

HistoryStack.prototype.go = function(delta) {
	var index = this.index + delta;
	if ((index < (this.states.length - 1)) || (index > (this.states.length - 1))) {
		throw new Error('Invalid state index:	' + index);
	}
	this.index = index;
};

HistoryStack.prototype.getState = function() {
	return this.states[this.index];
};

HistoryStack.prototype.getHasPrevious = function() {
	return this.index > 0;
};

HistoryStack.prototype.getHasNext = function() {
	return this.index < this.states.length - 1;
};

module.exports = HistoryStack;
