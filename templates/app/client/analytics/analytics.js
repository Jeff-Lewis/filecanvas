'use strict';

require('./lib/analytics');

var SegmentAnalyticsAdapter = require('./lib/adapters/SegmentAnalyticsAdapter');
var ConsoleAnalyticsAdapter = require('./lib/adapters/ConsoleAnalyticsAdapter');

$(function() {

	var adapter = (window.analytics ? new SegmentAnalyticsAdapter() : new ConsoleAnalyticsAdapter());

	$.fn.analytics.track = createTrackingFunction(function(trackingId, trackingData, callback) {
		adapter.track(trackingId, trackingData, callback);
	});


	function createTrackingFunction(trackEvent) {
		return function(event, trackingId, trackingData) {
			var element = this;
			var isNavigationEvent = Boolean(event) && getIsNavigationEvent(event, element);
			var isSubmitEvent = Boolean(event) && getIsSubmitEvent(event, element);
			if (isNavigationEvent) {
				trackNavigationEvent(event, element, trackingId, trackingData);
			} else if (isSubmitEvent) {
				trackSubmitEvent(event, element, trackingId, trackingData);
			} else {
				trackEvent(trackingId, trackingData);
			}


			function getIsNavigationEvent(event, element) {
				var isLinkElement = (element.tagName === 'A');
				var isAnchorLinkElement = isLinkElement && /^#/.test(element.getAttribute('href'));
				var isExternalLinkElement = isLinkElement && !isAnchorLinkElement;
				var isClickEvent = (event.type === 'click');
				return isExternalLinkElement && isClickEvent;
			}

			function getIsSubmitEvent(event, element) {
				var isLinkElement = (element.tagName === 'A');
				var isAnchorLinkElement = isLinkElement && /^#/.test(element.getAttribute('href'));
				var isExternalLinkElement = isLinkElement && !isAnchorLinkElement;
				var isClickEvent = (event.type === 'click');
				return isExternalLinkElement && isClickEvent;
			}

			function trackNavigationEvent(event, element, trackingId, trackingData) {
				event.preventDefault();
				var href = element.getAttribute('href');
				trackEvent(trackingId, trackingData, function() {
					document.location.href = href;
				});
			}

			function trackSubmitEvent(event, element, trackingId, trackingData) {
				event.preventDefault();
				trackEvent(trackingId, trackingData, function() {
					element.submit();
				});
			}
		};
	}
});
