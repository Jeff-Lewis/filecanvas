'use strict';

(function($) {
	var KEYCODE_ESCAPE = 27;
	var KEYCODE_LEFT = 37;
	var KEYCODE_RIGHT = 39;

	function Overlay(element) {
		var $element = $(element);
		var $contentElement = $element.find('[data-role="content"]');
		var $titleElement = $element.find('[data-role="title"]');
		var $descriptionElement = $element.find('[data-role="description"]');
		var $downloadButtonElement = $element.find('[data-role="download"]');
		var $closeButtonElement = $element.find('[data-role="close"]');
		var $previousButtonElement = $element.find('[data-role="previous"]');
		var $nextButtonElement = $element.find('[data-role="next"]');

		this.$element = $element;
		this.$contentElement = $contentElement;
		this.$titleElement = $titleElement;
		this.$descriptionElement = $descriptionElement;
		this.$downloadButtonElement = $downloadButtonElement;
		this.$closeButtonElement = $closeButtonElement;
		this.$previousButtonElement = $previousButtonElement;
		this.$nextButtonElement = $nextButtonElement;
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

		$previousButtonElement.on('click', function(event) {
			if (self.previousItem) { self.show(self.previousItem); }
		});

		$nextButtonElement.on('click', function(event) {
			if (self.nextItem) { self.show(self.nextItem); }
		});

		this.onKeyPressed = function(event) {
			switch (event.keyCode) {
				case KEYCODE_ESCAPE:
					onEscapeKeyPressed(event);
					return;
				case KEYCODE_LEFT:
					onLeftKeyPressed(event);
					return;
				case KEYCODE_RIGHT:
					onRightKeyPressed(event);
					return;
			}


			function onEscapeKeyPressed(event) {
				self.hide();
			}

			function onLeftKeyPressed(event) {
				if (self.previousItem) { self.show(self.previousItem); }
			}

			function onRightKeyPressed(event) {
				if (self.nextItem) { self.show(self.nextItem); }
			}
		};
	}

	Overlay.prototype.$element = null;
	Overlay.prototype.$contentElement = null;
	Overlay.prototype.$titleElement = null;
	Overlay.prototype.$descriptionElement = null;
	Overlay.prototype.$downloadButtonElement = null;
	Overlay.prototype.$closeButtonElement = null;
	Overlay.prototype.$previousButtonElement = null;
	Overlay.prototype.$nextButtonElement = null;
	Overlay.prototype.$htmlElement = null;

	Overlay.prototype.previousItem = null;
	Overlay.prototype.nextItem = null;
	Overlay.prototype.onKeyPressed = null;

	Overlay.prototype.show = function(options) {
		var title = options.title;
		var description = options.description;
		var downloadUrl = options.download || null;
		var previousItem = (options.collection ? getPreviousItem(options.collection, options) : null);
		var nextItem = (options.collection ? getNextItem(options.collection, options) : null);
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
		this.$previousButtonElement.prop('disabled', !previousItem);
		this.$nextButtonElement.prop('disabled', !nextItem);
		this.$element.addClass('is-active').addClass('is-loading');
		this.$htmlElement.addClass('overlay-active');

		this.previousItem = previousItem;
		this.nextItem = nextItem;

		$(document).off('keydown', this.onKeyPressed).on('keydown', this.onKeyPressed);


		function getPreviousItem(collection, item) {
			var currentIndex = collection.indexOf(item);
			if (currentIndex === -1) { currentIndex = 0; }
			return (currentIndex === 0 ? collection[collection.length - 1] : collection[currentIndex - 1]);
		}

		function getNextItem(collection, item) {
			var currentIndex = collection.indexOf(item);
			if (currentIndex === -1) { currentIndex = collection.length - 1; }
			return (currentIndex === collection.length - 1 ? collection[0] : collection[currentIndex + 1]);
		}

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
		this.previousItem = null;
		this.nextItem = null;
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

	$('[data-overlay]').overlay();

	$('[data-toggle="overlay"]').on('click', function(event) {
		event.preventDefault();
		var $element = $(this);
		var $overlayTriggerElements = $('[data-toggle="overlay"]');
		var itemIndex = $overlayTriggerElements.index(this);
		var overlayTargetSelector = $element.data('target') || null;
		var $targetElement = overlayTargetSelector ? $(overlayTargetSelector) : getDefaultOverlay();
		var overlayItems = parseOverlayItems($overlayTriggerElements);
		var overlayItem = overlayItems[itemIndex];
		overlayItems.forEach(function(item, index) {
			item.collection = overlayItems;
		});
		$targetElement.overlay('show', overlayItem);


		function parseOverlayItems($overlayTriggerElement) {
			return $overlayTriggerElements.map(function(index, element) {
				var $element = $(element);
				return parseOverlayItem($element);
			}).get();


			function parseOverlayItem($overlayTriggerElement) {
				var overlayType = $overlayTriggerElement.data('overlay-type') || null;
				var overlayUrl = $overlayTriggerElement.data('overlay-url');
				var overlayDownload = $overlayTriggerElement.data('overlay-download') || null;
				var overlayTitle = $overlayTriggerElement.data('overlay-title') || null;
				var overlayDescription = $overlayTriggerElement.data('overlay-description') || null;
				return {
					type: overlayType,
					url: overlayUrl,
					download: overlayDownload,
					title: overlayTitle,
					description: overlayDescription
				};
			}
		}

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
					'	<button type="button" class="overlay-previous" data-role="previous"></button>' +
					'	<button type="button" class="overlay-next" data-role="next"></button>' +
					'</div>';
				return $(templateHtml).overlay();
			}
		}
	});
})($);
