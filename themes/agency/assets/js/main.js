'use strict';

$(document).ready(function(){
	initStickyNav();
	initOnePageNav();
	initSelectNav();
	initSmoothScroll();
	initFooterHeight();
	initFileFilters();
	initOverlay();


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
				this.$htmlElement = $(document.documentElement);

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
			Overlay.prototype.$htmlElement = null;

			Overlay.prototype.onKeyPressed = null;

			Overlay.prototype.show = function(options) {
				var title = options.title;
				var description = options.description;
				var downloadUrl = options.download || null;
				var self = this;
				var contentElement = createContentElement(options, function(error) {
					self.$element.removeClass('is-loading');
					if (error) {
						self.$element.addClass('is-error');
					}
				});
				this.$contentElement.empty().append(contentElement);
				this.$titleElement.text(title);
				this.$descriptionElement.html(description);
				if (downloadUrl) {
					this.$downloadButtonElement.attr('href', downloadUrl);
				} else {
					this.$downloadButtonElement.removeAttr('href');
				}
				this.$element.addClass('is-active').addClass('is-loading');
				this.$htmlElement.addClass('overlay-active');

				$(document).off('keydown', this.onKeyPressed).on('keydown', this.onKeyPressed);


				function createContentElement(options, callback) {
					var contentType = options.type || detectContentType(options.url);
					switch (contentType) {
						case 'image':
							return createImageContentElement(options, callback);
						case 'iframe':
							return createIframeContentElement(options, callback);
						case 'pdf':
							return createPdfContentElement(options, callback);
						case 'unknown':
							return createUnknownContentElement(options, callback);
						default:
							throw new Error('Invalid overlay content type: ' + contentType);
					}


					function createImageContentElement(options, callback) {
						var imageUrl = options.url;
						var imageElement = document.createElement('img');
						imageElement.className = 'overlay-content-image';
						imageElement.src = imageUrl;
						$(imageElement).on('error', function(event) {
							callback(event.error || new Error(event.message));
						});
						$(imageElement).on('load', function(event) {
							callback(null);
						});
						return imageElement;
					}

					function createIframeContentElement(options, callback) {
						var iframeUrl = options.url;
						var iframeElement = document.createElement('iframe');
						iframeElement.className = 'overlay-content-iframe';
						iframeElement.frameBorder = 0;
						iframeElement.src = iframeUrl;
						$(iframeElement).on('error', function(event) {
							callback(event.error || new Error(event.message));
						});
						$(iframeElement).on('load', function(event) {
							callback(null);
						});
						return iframeElement;
					}

					function createPdfContentElement(options, callback) {
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
						setTimeout(function() {
							callback(null);
						});
						return objectElement;
					}

					function createUnknownContentElement(options, callback) {
						var url = options.url;
						var extension = getUrlExtension(url);
						var previewElement = document.createElement('div');
						previewElement.className = 'overlay-content-unknown';
						previewElement.setAttribute('data-extension', extension);
						setTimeout(function() {
							callback(null);
						});
						return previewElement;
					}

					function detectContentType(url) {
						var extension = getUrlExtension(url);
						switch (extension) {
							case 'jpg':
							case 'jpeg':
							case 'png':
							case 'gif':
								return 'image';

							case 'htm':
							case 'html':
							case 'txt':
							case null:
								return 'iframe';

							case 'pdf':
								return 'pdf';

							default:
								return 'unknown';
						}
					}

					function getUrlExtension(url) {
						var path = url.split('#')[0].split('?')[0];
						var filename = stripTrailingSlash(path).split('/').pop();
						var extension = filename.split('.').pop() || null;
						if (extension) { extension = extension.toLowerCase(); }
						return extension;

						function stripTrailingSlash(string) {
							var REGEXP_TRAILING_SLASH = /\/+$/;
							return string.replace(REGEXP_TRAILING_SLASH, '');
						}
					}
				}
			};

			Overlay.prototype.hide = function() {
				this.$element.removeClass('is-active');
				this.$contentElement.empty();
				this.$titleElement.text('');
				this.$descriptionElement.text('');
				this.$downloadButtonElement.removeAttr('href');
				this.$htmlElement.removeClass('overlay-active');
				$(document).off('keydown', this.onKeyPressed);
			};

			$.fn.overlay = function(action, options) {
				return this.each(function() {
					var $element = $(this);
					var overlay = $element.data('overlay') || null;
					if (!overlay) {
						overlay = new Overlay(this);
						$element.data('overlay', overlay);
					}

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

		$('[data-toggle="overlay"]').on('click', function(event) {
			event.preventDefault();
			var $element = $(this);
			var overlayTargetSelector = $element.data('target') || null;
			var overlayType = $element.data('overlay-type') || null;
			var overlayUrl = $element.data('overlay-url');
			var overlayDownload = $element.data('overlay-download') || null;
			var overlayTitle = $element.data('overlay-title') || null;
			var overlayDescription = $element.data('overlay-description') || null;

			var $targetElement = overlayTargetSelector ? $(overlayTargetSelector) : getDefaultOverlay();
			$targetElement.overlay('show', {
				type: overlayType,
				url: overlayUrl,
				download: overlayDownload,
				title: overlayTitle,
				description: overlayDescription
			});


			function getDefaultOverlay() {
				return $.fn.overlay.__defaultOverlay || ($.fn.overlay.__defaultOverlay = createOverlay().appendTo(document.body));


				function createOverlay() {
					var templateHtml =
						'<div class="overlay" data-overlay>' +
						'	<div class="overlay-content" data-role="content"></div>' +
						'	<div class="overlay-sidepanel">' +
						'		<button class="overlay-close" data-role="close"></button>' +
						'		<div class="overlay-details">' +
						'			<h1 class="overlay-title" data-role="title"></h1>' +
						'			<div class="overlay-description" data-role="description"></div>' +
						'		</div>' +
						'		<div class="overlay-controls">' +
						'			<a class="overlay-download" download data-role="download" href="#">Download</a>' +
						'		</div>' +
						'	</div>' +
						'</div>';
					return $(templateHtml).overlay();
				}
			}
		});
	}
});
