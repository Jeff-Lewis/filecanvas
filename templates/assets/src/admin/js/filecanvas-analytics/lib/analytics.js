'use strict';

(function($, window) {

	function AnalyticsEventSource(element) {
		var $element = $(element);
		var trackingId = $element.attr('data-analytics-id');
		var trackingData = parseJson($element.attr('data-analytics-data'));
		var trackingEvent = $element.attr('data-analytics-event') || getDefaultTrackingEvent($element);

		this.element = element;
		this.trackingId = trackingId;
		this.trackingData = trackingData;

		var self = this;
		$element.on(trackingEvent, function(event) {
			var element = this;
			var isNavigationEvent = Boolean(event) && getIsNavigationEvent(event, element);
			var isSubmitEvent = Boolean(event) && getIsSubmitEvent(event, element);
			if (isNavigationEvent) {
				trackNavigationEvent(event, element);
			} else if (isSubmitEvent) {
				trackSubmitEvent(event, element);
			} else {
				trackEvent();
			}


			function getIsNavigationEvent(event, element) {
				var isLinkElement = (element.tagName === 'A');
				var isAnchorLinkElement = isLinkElement && /^#/.test(element.getAttribute('href'));
				var isExternalLinkElement = isLinkElement && !isAnchorLinkElement;
				var willLeaveCurrentPage = isExternalLinkElement && (element.target !== '_blank') && !getIsModifierPressed(event);
				var isClickEvent = (event.type === 'click');
				return willLeaveCurrentPage && isClickEvent;


				function getIsModifierPressed(event) {
					var isModifierKeyPressed = getIsModifierKeyPressed(event);
					var isMiddleMouseButtonPressed = getIsMiddleMouseButtonPressed(event);
					return isModifierKeyPressed || isMiddleMouseButtonPressed;


					function getIsModifierKeyPressed(event) {
						return (event.metaKey || event.altKey || event.ctrlKey || event.shiftKey);
					}

					function getIsMiddleMouseButtonPressed(event) {
						var LEFT_MOUSE_BUTTON_INDEX = 1;
						var MIDDLE_MOUSE_BUTTON_INDEX = 2;
						var RIGHT_MOUSE_BUTTON_INDEX = 3;
						var buttonIndex = ('which' in event ? event.which : ('button' in event ? getLegacyMouseButtonIndex(event) : LEFT_MOUSE_BUTTON_INDEX));
						return buttonIndex === MIDDLE_MOUSE_BUTTON_INDEX;


						function getLegacyMouseButtonIndex(event) {
							var button = event.button;
							return (button & 1 ? LEFT_MOUSE_BUTTON_INDEX : (button & 2 ? RIGHT_MOUSE_BUTTON_INDEX : (button & 4 ? MIDDLE_MOUSE_BUTTON_INDEX : 0)));
						}
					}
				}
			}

			function getIsSubmitEvent(event, element) {
				var isFormElement = (element.tagName === 'FORM');
				var isSubmitEvent = (event.type === 'submit');
				return isFormElement && isSubmitEvent;
			}

			function trackNavigationEvent(event, element) {
				event.preventDefault();
				var href = element.getAttribute('href');
				self.track(event, function() {
					document.location.href = href;
				});
			}

			function trackSubmitEvent(event, element) {
				event.preventDefault();
				self.track(event, function() {
					element.submit();
				});
			}

			function trackEvent(event) {
				self.track(event);
			}
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

	AnalyticsEventSource.prototype.track = function(event, callback) {
		var trackingId = this.trackingId;
		var trackingData = this.trackingData;
		$.fn.analytics.track.call(this.element, event, trackingId, trackingData, callback);
	};

	$.fn.analytics = function(action) {
		return this.each(function() {
			var $element = $(this);
			var eventSource = $element.data('analytics') || null;
			if (!eventSource) {
				eventSource = new AnalyticsEventSource(this);
				$element.data('analytics', eventSource);
			}

			switch(action) {
				case 'track':
					eventSource.track(null);
					break;
				default:
					break;
			}
		});
	};

	$.fn.analytics.track = function(event, trackingId, trackingData, callback) {
		var log = window.console.info || window.console.log;
		log.call(window.console, 'Analytics event:', trackingId, trackingData);
		setTimeout(callback);
	};

	$('[data-analytics-id]').analytics();

})($, window || global);
