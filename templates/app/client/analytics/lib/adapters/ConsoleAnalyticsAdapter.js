'use strict';

var AnalyticsAdapter = require('./AnalyticsAdapter');

function ConsoleAnalyticsAdapter() {
	AnalyticsAdapter.call(this);
}

ConsoleAnalyticsAdapter.prototype = new AnalyticsAdapter();

ConsoleAnalyticsAdapter.prototype.track = function(trackingId, trackingData, callback) {
	window.console.info('Analytics event:', trackingId, trackingData);
	if (callback) { setTimeout(callback); }
};

module.exports = ConsoleAnalyticsAdapter;
