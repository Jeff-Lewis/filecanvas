'use strict';

$(function() {
	initScrollAnchors('body', { duration: 500 });
	initScrollSpy('body', { target: '#navigation', offset: 70 });
	initTooltips();
	initExamples('.examples');
});

function initScrollAnchors(navSelector, options) {
	options = options || {};
	var duration = options.duration || 300;
	var scrollOffset = options.offset || 0;

	var $navElement = $(navSelector);
	var $navLinkElements = $navElement.find('a[href^="#"]');
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

function initScrollSpy(scrollSelector, options) {
	$(scrollSelector).scrollspy(options);
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

