'use strict';

require('./lib/overlay');

var bytes = require('bytes');

(function($) {

	$(function() {
		initLocalizedDates();
		initOverlayDescriptions();
	});


	function initLocalizedDates() {
		$('time[datetime]').each(function(index, element) {
			var $element = $(this);
			var timestamp = Number($element.attr('datetime'));
			var date = new Date(timestamp *	1000);
			var dateString = getLocalizedDateString(date);
			$element.text(dateString);
		});
	}

	function initOverlayDescriptions() {
		$(document).on('mousedown', '[data-file]', function(event) {
			$('[data-file]').each(function(index, element) {
				var $element = $(element);
				if (!$element.attr('data-overlay-description')) {
					var filename = $element.attr('data-file');
					var timestamp = Number($element.attr('data-file-modified'));
					var modifiedDate = new Date(timestamp *	1000);
					var modifiedLabel = getLocalizedDateString(modifiedDate);
					var filesizeLabel = bytes(Number($element.attr('data-file-size')), { decimalPlaces: 1 });
					var description = filename + '\n' + modifiedLabel + ' – ' + filesizeLabel;
					$element.attr('data-overlay-description', description);
				}
			});
		});
	}

	function getLocalizedDateString(value) {
		var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
		var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
		var date = new Date(value);
		return DAYS[date.getDay()] + ' ' + date.getDate() + ' ' + MONTHS[date.getMonth()] + ' ' + date.getFullYear();
	}
})($);
