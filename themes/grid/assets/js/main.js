'use strict';

(function($){

	$(function() {
		initFilters();
	});


	function initFilters() {
		var $toggleElements = $('[data-toggle="filter"]');
		$toggleElements.each(function(index, element) {
			var $element = $(this);
			$element.on('click', function(event) {
				var $element = $(this);
				var targetSelector = $element.attr('data-target');
				var $targetElement = $(targetSelector);
				var filter = $element.attr('data-filter');
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
		});
	}
})($);
