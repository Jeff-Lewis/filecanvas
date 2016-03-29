'use strict';

$(function() {
	initScrollAnchors('body', { duration: 500 });
	initScrollSpy('body', { target: '#navigation', offset: 70 }, function(event) {
		var $activeElement = $(event.target);
		var trackingId = $activeElement.attr('data-scroll-analytics-id');
		var trackingData = parseJson($activeElement.attr('data-scroll-analytics-data'));
		if (trackingId) {
			$.fn.analytics.track.call($activeElement, event, trackingId, trackingData);
		}


		function parseJson(json) {
			return (json ? JSON.parse(json) : null);
		}
	});
	initTooltips();
	initFocusTriggers();
	initExamples('.examples');
});

function initScrollAnchors(navSelector, options) {
	options = options || {};
	var duration = options.duration || 300;
	var scrollOffset = options.offset || 0;

	var $navElement = $(navSelector);
	var $navLinkElements = $navElement.find('a[href^="#"]:not([data-scroll-disabled])');
	$navLinkElements.on('click', function(event) {
		event.preventDefault();
		var targetHash = this.hash;
		var $targetElement = $(targetHash);
		var targetOffset = $targetElement.offset().top + scrollOffset;
		$('html, body').animate({ scrollTop: targetOffset }, duration, function() {
			window.location.hash = targetHash;
		});
	});
}

function initScrollSpy(scrollSelector, options, callback) {
	var scrollspy = $(scrollSelector).scrollspy(options);
	if (callback) {
		scrollspy.on('activate.bs.scrollspy', callback);
	}
}

function initTooltips() {
	$('[data-toggle="tooltip"]').tooltip({
		animation: false
	});
	$('[data-toggle="popover"]').popover({
		animation: false
	}).on('click', function(event) {
		event.preventDefault();
	});
}

function initFocusTriggers() {
	var duration = 300;
	var scrollOffset = 30;
	$('[data-toggle="focus"').on('click', function(event) {
		var $element = $(this);
		event.preventDefault();
		var targetSelector = $element.attr('data-target') || $element.attr('href');
		var $targetElement = $(targetSelector);
		var targetElement = $targetElement[0];
		if (!targetElement) { return; }
		var targetOffset = $targetElement.offset().top;
		var currentScrollOffset = $(document).scrollTop();
		var targetScrollTop = null;
		if (targetOffset < currentScrollOffset) {
			targetScrollTop = targetOffset - scrollOffset;
		} else {
			var targetHeight = $targetElement.outerHeight() + scrollOffset;
			var windowHeight = $(window).height();
			if (currentScrollOffset + windowHeight < targetOffset + targetHeight) {
				targetScrollTop = targetOffset + targetHeight - windowHeight;
			}
		}
		if (targetScrollTop) {
			$('html, body').animate({ scrollTop: targetScrollTop }, duration, function() {
				targetElement.focus();
			});
		} else {
			targetElement.focus();
		}
	});
}

function initExamples(selector) {
	$(selector).each(function(index, element) {
		var $formElement = $(element);
		var $carouselElement = $formElement.find('.examples-carousel');
		var $radioElements = $formElement.find('input[type="radio"]');
		var $optionElements = $formElement.find('.examples-option');
		var optionValues = $radioElements.map(function(index, element) {
			var $radioElement = $(element);
			return $radioElement.val();
		}).get();
		$formElement.on('change', function(event) {
			var targetElement = event.target;
			var value = targetElement.value;
			var selectedIndex = optionValues.indexOf(value);
			$optionElements.each(function(index, element) {
				var $optionElement = $(element);
				var optionIndex = $optionElement.index();
				var isSelected = (optionIndex === selectedIndex);
				$optionElement.toggleClass('selected', isSelected);
			});
			$carouselElement.carousel(selectedIndex);
		});
	});
}

