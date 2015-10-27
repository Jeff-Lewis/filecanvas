'use strict';

var junk = require('junk');
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
				return virtualize.fromHTML(html);
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
		var $progressLabelElement = $('[data-editor-progress-label]');
		var $progressBarElement = $('[data-editor-progress-bar]');
		var $progressCancelButtonElement = $('[data-editor-progress-cancel]');
		var previewWindow = $previewElement.prop('contentWindow');
		var shuntApi = window.shunt;
		var adapterConfig = loadAdapterConfig();
		var activeUpload = null;
		initHotspots(previewWindow, onFilesSelected);
		$progressCancelButtonElement.on('click', onUploadCancelRequested);


		function loadAdapterConfig() {
			var cookies = parseCookies(document.cookie);
			var adapterConfig = JSON.parse(cookies.adapter);
			return adapterConfig;

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
		}

		function onFilesSelected(files) {
			var filteredFiles = getFilteredFiles(files);
			var isUploadInProgress = Boolean(activeUpload);
			if (isUploadInProgress) {
				activeUpload.append(filteredFiles);
			} else {
				activeUpload = uploadFiles(filteredFiles, shuntApi, adapterConfig);
				activeUpload.always(function() {
					activeUpload = null;
				});
			}


			function getFilteredFiles(files) {
				return files.filter(function(file) {
					var filename = file.data.name;
					return junk.not(filename);
				});
			}
		}

		function onUploadCancelRequested(event) {
			if (activeUpload) { activeUpload.abort(); }
		}

		function uploadFiles(files, shuntApi, adapterConfig) {
			showUploadProgressIndicator();
			var upload = shuntApi.uploadFiles(files, adapterConfig);
			upload
				.progress(function(uploadBatch) {
					setUploadProgress(uploadBatch);
				})
				.then(function(uploadBatch) {
					setUploadProgress(uploadBatch);
				})
				.fail(function(error) {
					showUploadError(error);
				})
				.always(function() {
					hideUploadProgressIndicator();
					updatePreview({
						cached: false,
						config: currentThemeConfig
					});
				});
			return upload;


				function showUploadProgressIndicator() {
					setProgressBarLabel(null);
					setProgressBarValue({
						loaded: 0,
						total: 0
					});
					$progressBarElement.attr('aria-valuenow', 0);
					$progressElement.addClass('active');
				}

				function hideUploadProgressIndicator() {
					$progressElement.removeClass('active');
					setProgressBarValue({
						loaded: 0,
						total: 0
					});
				}

				function setProgressBarLabel(message) {
					$progressLabelElement.text(message);
				}

				function setProgressBarValue(options) {
					options = options || {};
					var loaded = options.loaded || 0;
					var total = options.total || 0;
					var percentLoaded = 100 * (total === 0 ? 0 : loaded / total);
					$progressBarElement.attr('aria-valuemin', 0);
					$progressBarElement.attr('aria-valuemax', total);
					$progressBarElement.attr('aria-valuenow', loaded);
					$progressBarElement.attr('data-percent', percentLoaded);
					$progressBarElement.css('width', percentLoaded + '%');
				}

				function showUploadError(error) {
					// TODO: Show file upload error dialog
					alert('Upload failed'); // eslint-disable-line no-alert
				}

				function setUploadProgress(uploadBatch) {
					var currentFilename = uploadBatch.currentItem && uploadBatch.currentItem.filename || null;
					setProgressBarLabel(currentFilename);
					setProgressBarValue({
						loaded: uploadBatch.bytesLoaded,
						total: uploadBatch.bytesTotal
					});
				}
		}

		function initHotspots(previewWindow, uploadCallback) {
			var $previewDocument = $(previewWindow.document);

			$previewDocument.ready(function() {
				disableContextMenu();
				initUploadHotspots('[data-admin-upload]', function(files) {
					uploadCallback(files);
				});


				function disableContextMenu() {
					$previewDocument.on('contextmenu', function(event) {
						event.preventDefault();
					});
				}

				function initUploadHotspots(selector, callback) {
					var $activeDropTarget = null;
					$previewDocument
						.on('dragenter dragover', '[data-admin-upload]', function(event) {
							var $element = $(this);
							var dataTransfer = event.originalEvent.dataTransfer;
							var shouldAcceptDrag = getIsFileDrag(dataTransfer);
							if (!shouldAcceptDrag) { return; }
							event.stopPropagation();
							acceptDropOperation(event.originalEvent, 'copy');
							setActiveDropTarget($element);


							function getIsFileDrag(dataTransfer) {
								var mimeTypes = Array.prototype.slice.call(dataTransfer.types);
								var isFileDrag = (mimeTypes.indexOf('Files') !== -1);
								return isFileDrag;
							}

							function acceptDropOperation(event, dropEffect) {
								event.dataTransfer.dropEffect = dropEffect;
								event.preventDefault();
							}
						})
						.on('dragleave', '[data-admin-upload]', function(event) {
							event.stopPropagation();
							setActiveDropTarget(null);
						})
						.on('drop', '[data-admin-upload]', function(event) {
							var $element = $(this);
							var dataTransfer = event.originalEvent.dataTransfer;
							event.preventDefault();
							event.stopPropagation();
							setActiveDropTarget(null);
							if (!dataTransfer) { return; }
							var pathPrefix = $element.data('admin-upload') || '';
							if (dataTransfer.items) {
								loadDataTransferItems(dataTransfer.items, onFilesLoaded);
							} else if (dataTransfer.files) {
								loadDataTransferFiles(dataTransfer.files, onFilesLoaded);
							}


							function onFilesLoaded(files) {
								var prefixedFiles = getPathPrefixedFiles(files, pathPrefix);
								callback(prefixedFiles);


								function getPathPrefixedFiles(files, pathPrefix) {
									if (!pathPrefix) { return files; }
									return files.map(function(file) {
										return {
											path: pathPrefix + file.path,
											data: file.data
										};
									});
								}
							}
						})
						.on('dragend', function(event) {
							setActiveDropTarget(null);
						});


					function setActiveDropTarget($element) {
						if ($activeDropTarget === $element) { return; }
						if ($activeDropTarget) { $activeDropTarget.removeClass('dragging'); }
						$activeDropTarget = $element;
						if ($activeDropTarget) { $activeDropTarget.addClass('dragging'); }
					}

					function loadDataTransferItems(itemsList, callback) {
						var items = Array.prototype.slice.call(itemsList);
						var entries = items.map(function(item) {
							if (item.getAsEntry) { return item.getAsEntry(); }
							if (item.webkitGetAsEntry) { return item.webkitGetAsEntry(); }
							return item;
						});
						loadEntries(entries, callback);


						function loadEntries(entries, callback) {
							if (entries.length === 0) { return callback([]); }
							var numRemaining = entries.length;
							var files = entries.map(function(entry, index) {
								loadEntry(entry, function(result) {
									files[index] = result;
									if (--numRemaining === 0) {
										var flattenedFiles = getFlattenedFiles(files);
										callback(flattenedFiles);
									}
								});
								return undefined;


								function getFlattenedFiles(files) {
									return files.reduce(function(flattenedFiles, file) {
										return flattenedFiles.concat(file);
									}, []);
								}
							});


							function loadEntry(entry, callback) {
								if (entry.isFile) {
									loadFile(entry, callback);
								} else if (entry.isDirectory) {
									loadDirectory(entry, callback);
								}


								function loadFile(entry, callback) {
									entry.file(function(file) {
										callback({
											path: entry.fullPath,
											data: file
										});
									});
								}

								function loadDirectory(entry, callback) {
									var reader = entry.createReader();
									reader.readEntries(function(entries) {
										loadEntries(entries, callback);
									});
								}
							}
						}
					}

					function loadDataTransferFiles(fileList, callback) {
						var files = Array.prototype.slice.call(fileList);
						setTimeout(function() {
							callback(files.map(function(file) {
								return {
									path: '/' + file.name,
									data: file
								};
							}));
						});
					}
				}
			});
		}
	}
}
