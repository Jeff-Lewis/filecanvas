'use strict';

(function($){

	$(function() {
		initAdminMode();
		initFilters('[data-toggle="filter"]');
	});

	function initAdminMode() {
		var isWithinIframe = (window !== window.top);
		if (isWithinIframe) {
			preventNavigation();
		}


		function preventNavigation() {
			$(document).on('click', 'a[href]', function(event) {
				event.preventDefault();
			});
		}
	}

	function initFilters(selector) {
		$(document).on('click', selector, function(event) {
			event.preventDefault();
			var $element = $(this);
			var targetSelector = $element.attr('data-target');
			var $targetElement = $(targetSelector);
			var filter = $element.attr('data-filter');
			var $toggleElements = $(selector);
			$toggleElements.each(function(index, element) {
				var $toggleElement = $(element);
				var isActive = ($toggleElement.attr('data-filter') === filter);
				$toggleElement.toggleClass('active', isActive);
			});
			$targetElement.children().each(function(index, element) {
				var $itemElement = $(element);
				var isVisible = (!filter || ($itemElement.attr('data-filter') === filter));
				$itemElement.toggleClass('hidden', !isVisible);
			});
		});
	}
})($);
