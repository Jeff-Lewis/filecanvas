'use strict';

function AnalyticsAdapter() {
}

AnalyticsAdapter.prototype.track = function(trackingId, trackingData, callback) {
	throw new Error('Not implemented');
};

module.exports = AnalyticsAdapter;
