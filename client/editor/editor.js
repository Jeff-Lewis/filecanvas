'use strict';

var vdom = require('virtual-dom');
var virtualize = require('vdom-virtualize');

var LIVE_UPDATE_DEBOUNCE_DURATION = 1000;

$(function() {
	initColorpickers();
	initSidepanel();
	initLivePreview();
});


function initColorpickers() {
	var isChanging = false;
	$('[data-colorpicker]').colorpicker().on('changeColor.colorpicker', function(event) {
		if (isChanging) { return; }
		var $colorPickerElement = $(this);
		var $inputElement = $colorPickerElement.data('colorpicker').input;
		isChanging = true;
		$inputElement.change();
		isChanging = false;
	});
}

function initSidepanel() {
	$('[data-toggle="collapse-sidepanel"]').on('click', function(event) {
		var targetSelector = $(this).data('target');
		var $targetElement = $(targetSelector);
		$targetElement.toggleClass('collapsed');
	});
}

function initLivePreview() {
	var $formElement = $('[data-editor-form]');
	var $previewElement = $('[data-editor-preview]');

	var iframeSrc = $previewElement.prop('src');
	var patchIframeContent = null;
	var currentThemeConfig = null;
	var previewUrl = getPreviewUrl(iframeSrc, {
		cached: true
	});

	initLiveUpdates();
	initInlineUploads();


	function initLiveUpdates() {
		$formElement.on('change input', debounce(onFieldChanged, LIVE_UPDATE_DEBOUNCE_DURATION));

		$previewElement.addClass('loading').on('load', function() {
			var $element = $(this);
			loadHtml(previewUrl)
				.then(function(html) {
					var iframeDocumentElement = getIframeDomElement($element[0]);
					patchIframeContent = createDocumentPatcher(iframeDocumentElement, html);
					$element.removeClass('loading');
				});
		});


		function onFieldChanged() {
			var formFieldValues = parseFormFieldValues($formElement);
			var nestedFormFieldValues = parseNestedPropertyValues(formFieldValues);
			var themeConfigOverrides = nestedFormFieldValues.theme.config;
			updatePreview({
				cached: true,
				config: themeConfigOverrides
			});


			function parseFormFieldValues($formElement) {
				var fieldElements = Array.prototype.slice.call($formElement.prop('elements'));
				return fieldElements.map(function(element) {
					var elementName = element.name;
					var elementValue = element.value;
					return {
						'key': elementName,
						'value': elementValue
					};
				}).reduce(function(values, property) {
					var key = property.key;
					var value = property.value;
					values[key] = value;
					return values;
				}, {});
			}

			function parseNestedPropertyValues(values) {
				return Object.keys(values).map(function(key) {
					return {
						key: key,
						value: values[key]
					};
				}).reduce(function(values, property) {
					var propertyName = property.key;
					var propertyValue = property.value;
					var propertyNameSegments = propertyName.split('.');
					propertyNameSegments.reduce(function(parent, propertyNameSegment, index, array) {
						if (index === array.length - 1) {
							parent[propertyNameSegment] = propertyValue;
							return propertyValue;
						}
						if (!(propertyNameSegment in parent)) {
							parent[propertyNameSegment] = {};
						}
						return parent[propertyNameSegment];
					}, values);
					return values;
				}, {});
			}
		}

		function createDocumentPatcher(documentElement, html) {
			var htmlElement = documentElement.documentElement;
			var tree = parseHtmlIntoVDom(html);
			return patch;


			function patch(html) {
				tree = patchElementHtml(htmlElement, tree, html);
			}

			function patchElementHtml(element, tree, updatedHtml) {
				var updatedTree = parseHtmlIntoVDom(updatedHtml);
				var patch = vdom.diff(tree, updatedTree);
				vdom.patch(element, patch);
				return updatedTree;
			}

			function parseHtmlIntoVDom(html) {
				var iframeElement = document.createElement('iframe');
				iframeElement.style.display = 'none';
				document.body.appendChild(iframeElement);
				var documentElement = iframeElement.contentDocument || iframeElement.contentWindow.document;
				documentElement.open();
				documentElement.write(html);
				documentElement.close();
				var htmlElement = documentElement.documentElement;
				var tree = virtualize(htmlElement);
				document.body.removeChild(iframeElement);
				return tree;
			}
		}

		function debounce(func, wait, immediate) {
			var timeout;
			return function() {
				var context = this, args = arguments;
				var later = function() {
					timeout = null;
					if (!immediate) { func.apply(context, args); }
				};
				var callNow = immediate && !timeout;
				clearTimeout(timeout);
				timeout = setTimeout(later, wait);
				if (callNow) { func.apply(context, args); }
			};
		}

		function getIframeDomElement(iframeElement) {
			return (iframeElement.contentDocument || iframeElement.contentWindow.document);
		}
	}


	function getPreviewUrl(previewUrl, params) {
		var baseUrl = previewUrl.split('#')[0].split('?')[0];
		return baseUrl + '?' + serializeQueryParams(params);


		function serializeQueryParams(params) {
			return Object.keys(params).map(function(key) {
				var value = params[key];
				return key + '=' + encodeURIComponent(JSON.stringify(value));
			}).join('&');
		}
	}

	function updatePreview(params) {
		currentThemeConfig = params.config || null;
		var updatedPreviewUrl = getPreviewUrl(previewUrl, params);
		var supportsLiveDomPatching = Boolean(patchIframeContent);
		if (!supportsLiveDomPatching) {
			$previewElement.prop('src', updatedPreviewUrl);
			return;
		}
		loadHtml(updatedPreviewUrl)
			.then(function(html) {
				patchIframeContent(html);
			});
	}

	function loadHtml(url) {
		return $.ajax(url)
			.then(function(data, textStatus, jqXHR) {
				return new $.Deferred().resolve(data).promise();
			})
			.fail(function(jqXHR, textStatus, errorThrown) {
				return new $.Deferred().reject(new Error(errorThrown)).promise();
			});
	}

	function initInlineUploads() {
		var $previewElement = $('[data-editor-preview]');
		var $progressElement = $('[data-editor-progress]');
		var $progressBarElement = $('[data-editor-progress-bar]');
		var previewWindow = $previewElement.prop('contentWindow');
		var shuntApi = window.shunt;
		var cookies = parseCookies(document.cookie);
		var providerConfig = JSON.parse(cookies.provider);
		var accessToken = providerConfig.token;
		var sitePath = providerConfig.path;
		previewWindow.shunt = {
			uploadFiles: function(files) {
				showUploadProgressIndicator();
				shuntApi.uploadFiles(files, accessToken, {
					path: sitePath,
					overwrite: false,
					autorename: true
				})
					.progress(function(uploadBatch) {
						setUploadProgress(uploadBatch);
					})
					.then(function(uploadBatch) {
						setUploadProgress(uploadBatch);
						hideUploadProgressIndicator();
						updatePreview({
							cached: false,
							config: currentThemeConfig
						});
					})
					.fail(function(error) {
						showUploadError(error);
					});
			}
		};


		function parseCookies(cookiesString) {
			var cookies = cookiesString.split(/;\s*/).map(function(cookieString) {
				var match = /^(.*?)=(.*)$/.exec(cookieString);
				return {
					key: match[1],
					value: match[2]
				};
			}).reduce(function(cookies, cookie) {
				cookies[cookie.key] = decodeURIComponent(cookie.value);
				return cookies;
			}, {});
			return cookies;
		}

		function showUploadProgressIndicator() {
			setProgressBarValue($progressBarElement, {
				loaded: 0,
				total: 0
			});
			$progressBarElement.attr('aria-valuenow', 0);
			$progressElement.addClass('active');
		}

		function hideUploadProgressIndicator() {
			$progressElement.removeClass('active');
		}

		function setProgressBarValue($element, options) {
			options = options || {};
			var loaded = options.loaded || 0;
			var total = options.total || 0;
			var percentLoaded = 100 * (total === 0 ? 0 : loaded / total);
			$element.attr('aria-valuemin', 0);
			$element.attr('aria-valuemax', total);
			$element.attr('aria-valuenow', loaded);
			$element.attr('data-percent', percentLoaded);
			$element.css('width', percentLoaded + '%');
		}

		function showUploadError(error) {
			alert('Upload failed'); // eslint-disable-line no-alert
		}

		function setUploadProgress(uploadBatch) {
			setProgressBarValue($progressBarElement, {
				loaded: uploadBatch.bytesLoaded,
				total: uploadBatch.bytesTotal
			});
		}
	}
}
