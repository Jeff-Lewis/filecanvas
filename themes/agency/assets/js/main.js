'use strict';

$(document).ready(function(){
	initStickyNav();
	initOnePageNav();
	initSelectNav();
	initSmoothScroll();
	initFooterHeight();
	initOverlay();
	initFileFilters();
	initFilePreview();


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

	function initOverlay() {

		(function($) {
			var KEYCODE_ESCAPE = 27;

			function Overlay(element) {
				var $element = $(element);
				var $contentElement = $element.find('[data-role="content"]');
				var $titleElement = $element.find('[data-role="title"]');
				var $descriptionElement = $element.find('[data-role="description"]');
				var $downloadButtonElement = $element.find('[data-role="download"]');
				var $closeButtonElement = $element.find('[data-role="close"]');

				this.$element = $element;
				this.$contentElement = $contentElement;
				this.$titleElement = $titleElement;
				this.$descriptionElement = $descriptionElement;
				this.$downloadButtonElement = $downloadButtonElement;
				this.$closeButtonElement = $closeButtonElement;

				var self = this;

				$element.on('mousedown', function(event) {
					var wasBackgroundPressed = (event.target === event.currentTarget);
					if (wasBackgroundPressed) {
						self.hide();
					}
				});

				$closeButtonElement.on('click', function(event) {
					self.hide();
				});

				this.onKeyPressed = function(event) {
					switch (event.keyCode) {
						case KEYCODE_ESCAPE:
							onEscapeKeyPressed(event);
							return;
					}


					function onEscapeKeyPressed(event) {
						self.hide();
					}
				};
			}

			Overlay.prototype.$element = null;
			Overlay.prototype.$contentElement = null;
			Overlay.prototype.$titleElement = null;
			Overlay.prototype.$descriptionElement = null;
			Overlay.prototype.$downloadButtonElement = null;
			Overlay.prototype.$closeButtonElement = null;

			Overlay.prototype.onKeyPressed = null;

			Overlay.prototype.show = function(options) {
				var title = options.title;
				var description = options.description;
				var downloadUrl = options.download || null;
				var contentElement = createContentElement(options);
				this.$contentElement.empty().append(contentElement);
				this.$titleElement.text(title);
				this.$descriptionElement.html(description);
				if (downloadUrl) {
					this.$downloadButtonElement.attr('href', downloadUrl);
				} else {
					this.$downloadButtonElement.removeAttr('href');
				}
				this.$element.addClass('is-active');

				$(document).off('keydown', this.onKeyPressed).on('keydown', this.onKeyPressed);


				function createContentElement(options) {
					var contentType = options.type;
					switch (contentType) {
						case 'image':
							return createImageContentElement(options);
						case 'iframe':
							return createIframeContentElement(options);
						case 'pdf':
							return createPdfContentElement(options);
						default:
							throw new Error('Invalid overlay content type: ' + contentType);
					}


					function createImageContentElement(options) {
						var imageUrl = options.url;
						var imageElement = document.createElement('img');
						imageElement.className = 'overlay-content-image';
						imageElement.src = imageUrl;
						return imageElement;
					}

					function createIframeContentElement(options) {
						var iframeUrl = options.url;
						var iframeElement = document.createElement('iframe');
						iframeElement.className = 'overlay-content-iframe';
						iframeElement.frameBorder = 0;
						iframeElement.src = iframeUrl;
						return iframeElement;
					}

					function createPdfContentElement(options) {
						var pdfUrl = options.url;
						var objectElement = document.createElement('object');
						objectElement.className = 'overlay-content-pdf';
						objectElement.type = 'application/pdf';
						objectElement.width = '100%';
						objectElement.height = '100%';
						objectElement.data = pdfUrl;
						var embedElement = document.createElement('embed');
						embedElement.type = 'application/pdf';
						embedElement.width = '100%';
						embedElement.height = '100%';
						embedElement.src = pdfUrl;
						objectElement.appendChild(embedElement);
						return objectElement;
					}
				}
			};

			Overlay.prototype.hide = function() {
				this.$element.removeClass('is-active');
				this.$contentElement.empty();
				this.$titleElement.text('');
				this.$descriptionElement.text('');
				this.$downloadButtonElement.removeAttr('href');
				$(document).off('keydown', this.onKeyPressed);
			};

			$.fn.overlay = function(action, options) {
				return this.each(function() {
					var $element = $(this);
					var overlay = $element.data('overlay') || null;
					if (!overlay) { overlay = new Overlay(this); }

					switch (action) {
						case 'show':
							overlay.show(options);
							break;
						case 'hide':
							overlay.hide();
							break;
					}
				});
			};

		})($);

		$('[data-overlay]').overlay();
	}

	function initFilePreview() {
		var IMAGE_PREVIEW_EXTENSIONS = [
			'jpg',
			'jpeg',
			'gif',
			'png'
		];
		var DOCUMENT_PREVIEW_EXTENSIONS = [
			'html',
			'txt'
		];
		var PDF_PREVIEW_EXTENSIONS = [
			'pdf'
		];
		$(document).on('click', '.post a.project-wrp', function(event) {
			var $element = $(event.currentTarget);
			var downloadUrl = $element.attr('href');
			var extension = downloadUrl.split('.').pop();
			var title = $element.attr('data-title');
			var description = $element.attr('data-description');
			var canShowImagePreview = IMAGE_PREVIEW_EXTENSIONS.indexOf(extension) !== -1;
			if (canShowImagePreview) {
				event.preventDefault();
				showOverlay({
					type: 'image',
					url: downloadUrl,
					title: title,
					description: description
				});
			}
			var canShowDocumentPreview = DOCUMENT_PREVIEW_EXTENSIONS.indexOf(extension) !== -1;
			if (canShowDocumentPreview) {
				event.preventDefault();
				showOverlay({
					type: 'iframe',
					url: downloadUrl,
					title: title,
					description: description
				});
			}
			var canShowPdfPreview = PDF_PREVIEW_EXTENSIONS.indexOf(extension) !== -1;
			if (canShowPdfPreview) {
				event.preventDefault();
				showOverlay({
					type: 'pdf',
					url: downloadUrl,
					title: title,
					description: description
				});
			}
		});


		function showOverlay(options) {
			$('#overlay').overlay('show', {
				type: options.type,
				url: options.url,
				download: options.url,
				title: options.title,
				description: options.description
			});
		}
	}

});
