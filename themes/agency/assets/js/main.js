'use strict';

$(document).ready(function(){
	initStickyNav();
	initOnePageNav();
	initSelectNav();
	initSmoothScroll();
	initFooterHeight();
	initFileFilters();
	initLocalizedDates();
	initOverlayDescriptions();


	function initStickyNav() {
		$('#mainnav').sticky({ topSpacing: 0 });
	}

	function initOnePageNav() {
		$('#fluid-nav').onePageNav({
			currentClass: 'current',
			changeHash: false,
			scrollSpeed: 750,
			scrollOffset: 30,
			scrollThreshold: 0.5,
			filter: ':not(.external)',
			easing: 'swing'
		});
	}

	function initSelectNav() {
		selectnav('fluid-nav', {
			nested: false,
			label: false
		});
	}

	function initSmoothScroll() {
		$(document).on('click', '.scroll-link:not(.external)', function(event) {
			event.preventDefault();
			var $element = $(this);
			var targetSelector = $element.attr('href');
			var $targetElement = $(targetSelector);
			$('html, body').animate({
				scrollTop: $targetElement.offset().top + 'px'
			}, {
				duration: 500,
				easing: 'swing'
			});
		});
	}

	function initFooterHeight() {
		var footerHeight = 0;
		updateFooterHeight();
		$(window).on('resize', function() {
			updateFooterHeight();
		});


		function updateFooterHeight() {
			var updatedFooterHeight = $('footer').outerHeight();
			if (updatedFooterHeight === footerHeight) { return; }
			footerHeight = updatedFooterHeight;
			$('.pages').css('paddingBottom', footerHeight);
		}
	}

	function initFileFilters() {
		$(document).on('click', '.page .option-set a', function(event) {
			event.preventDefault();

			var $element = $(this);
			var $optionSet = $element.closest('.option-set');
			var $group = $element.closest('.page');

			var isAlreadySelected = $element.hasClass('selected');
			if (isAlreadySelected) { return false; }

			$optionSet.find('.selected').removeClass('selected');
			$element.addClass('selected');

			var filterSelector = $element.attr('data-option-value');
			$group.find('.post').each(function(index, element) {
				var $element = $(element);
				$element.toggleClass('hidden', !$element.is(filterSelector));
			});

			return false;
		});
	}

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
		$('[data-file]').each(function(index, element) {
			var $element = $(this);
			var filename = $element.attr('data-file');
			var timestamp = Number($element.attr('data-file-modified'));
			var modifiedDate = new Date(timestamp *	1000);
			var modifiedLabel = getLocalizedDateString(modifiedDate);
			var filesizeLabel = bytes(Number($element.attr('data-file-size')), { decimalPlaces: 1 });
			var description = filename + '<br/>' + modifiedLabel + ' – ' + filesizeLabel;
			$element.attr('data-overlay-description', description);
		});
	}

	function getLocalizedDateString(value) {
		var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
		var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
		var date = new Date(value);
		return DAYS[date.getDay()] + ' ' + date.getDate() + ' ' + MONTHS[date.getMonth()] + ' ' + date.getFullYear();
	}


	function bytes(value, options) {
		/*!
		 * bytes
		 * Copyright(c) 2012-2014 TJ Holowaychuk
		 * Copyright(c) 2015 Jed Watson
		 * MIT Licensed
		 */

		if (typeof value !== 'number') {
			return null;
		}

		var map = {
			b: 1,
			kb: 1 << 10,
			mb: 1 << 20,
			gb: 1 << 30,
			tb: ((1 << 30) * 1024)
		};

		var mag = Math.abs(value);
		var thousandsSeparator = (options && options.thousandsSeparator) || '';
		var decimalPlaces = (options && options.decimalPlaces !== undefined) ? options.decimalPlaces : 2;
		var fixedDecimals = Boolean(options && options.fixedDecimals);
		var unit = 'B';

		if (mag >= map.tb) {
			unit = 'TB';
		} else if (mag >= map.gb) {
			unit = 'GB';
		} else if (mag >= map.mb) {
			unit = 'MB';
		} else if (mag >= map.kb) {
			unit = 'kB';
		}

		var val = value / map[unit.toLowerCase()];
		var str = val.toFixed(decimalPlaces);

		if (!fixedDecimals) {
			str = str.replace(/(?:\.0*|(\.[^0]+)0+)$/, '$1');
		}

		if (thousandsSeparator) {
			str = str.replace(/\B(?=(\d{3})+(?!\d))/g, thousandsSeparator);
		}

		return str + unit;
	}
});
