'use strict';

var AnalyticsAdapter = require('./AnalyticsAdapter');

function SegmentAnalyticsAdapter(api) {
	AnalyticsAdapter.call(this);
}

SegmentAnalyticsAdapter.prototype = new AnalyticsAdapter();

SegmentAnalyticsAdapter.prototype.api = null;

SegmentAnalyticsAdapter.prototype.track = function(trackingId, trackingData, callback) {
	var analytics = (typeof window !== 'undefined' ? window.analytics : global.analytics);
	analytics.track(trackingId, trackingData, callback);
};

module.exports = SegmentAnalyticsAdapter;
