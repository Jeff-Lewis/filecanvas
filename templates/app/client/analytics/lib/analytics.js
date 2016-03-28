'use strict';

(function($, window) {

	function Analytics(element) {
		var $element = $(element);
		var trackingId = $element.attr('data-analytics-id');
		var trackingData = parseJson($element.attr('data-analytics-data'));
		var trackingEvent = $element.attr('data-analytics-event') || getDefaultTrackingEvent($element);

		this.element = element;
		this.trackingId = trackingId;
		this.trackingData = trackingData;

		var self = this;
		$element.on(trackingEvent, function(event) {
			self.track(event);
		});


		function parseJson(json) {
			if (!json) { return null; }
			try {
				return JSON.parse(json);
			} catch (error) {
				throw new Error('Invalid analytics data for id ' + trackingId + ': ' + json);
			}
		}

		function getDefaultTrackingEvent($element) {
			if ($element.is('form')) {
				return 'submit';
			} else if ($element.is('input, select, textarea')) {
				return 'change';
			} else {
				return 'click';
			}
		}
	}

	Analytics.prototype.track = function(event) {
		var trackingId = this.trackingId;
		var trackingData = this.trackingData;
		$.fn.analytics.track.call(this.element, event, trackingId, trackingData);
	};

	$.fn.analytics = function(action) {
		return this.each(function() {
			var $element = $(this);
			var analytics = $element.data('analytics') || null;
			if (!analytics) {
				analytics = new Analytics(this);
				$element.data('analytics', analytics);
			}

			switch(action) {
				case 'track':
					analytics.track(null);
					break;
				default:
					break;
			}
		});
	};

	$.fn.analytics.track = function(event, trackingId, trackingData) {
		var log = window.console.info || window.console.log;
		log.call(window.console, 'Analytics event:', trackingId, trackingData);
	};

	$('[data-analytics-id]').analytics();

})($, window || global);
