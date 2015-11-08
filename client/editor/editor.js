'use strict';

var junk = require('junk');
var objectAssign = require('object-assign');
var template = require('lodash.template');
var merge = require('lodash.merge');
var isEqual = require('lodash.isequal');
var Mousetrap = require('mousetrap');

var getIframeDomElement = require('./utils/getIframeDomElement');
var onIframeDomReady = require('./utils/onIframeDomReady');
var removeAllChildren = require('./utils/removeAllChildren');
var loadJson = require('./utils/loadJson');
var parseJson = require('./utils/parseJson');
var serializeQueryParams = require('./utils/serializeQueryParams');
var getFormFieldValues = require('./utils/getFormFieldValues');
var debounce = require('./utils/debounce');

var HistoryStack = require('./lib/HistoryStack');

var engines = require('./engines');

var NUM_UPLOAD_RETRIES = 2;

$(function() {
	initColorpickers();
	initSidepanel();
	initLivePreview();
});


function initColorpickers() {
	$('[data-colorpicker]').colorpicker()
		.on('showPicker.colorpicker', function(event) {
			var $colorPickerElement = $(this);
			var $inputElement = $colorPickerElement.data('colorpicker').input;
			var currentValue = $inputElement.val();
			$colorPickerElement.one('hidePicker.colorpicker', function(event) {
				var hasChanged = (currentValue !== $inputElement.val());
				if (hasChanged) { $inputElement.change(); }
			});
		})
		.on('changeColor.colorpicker', function(event) {
			var $colorPickerElement = $(this);
			var $inputElement = $colorPickerElement.data('colorpicker').input;
			$inputElement.trigger('input');
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
	var $adapterConfigElement = $('[data-editor-adapter-config]');
	var $previewElement = $('[data-editor-preview]');
	var $previewDataElement = $('[data-editor-preview-data]');
	var $undoButtonElement = $('[data-editor-undo]');
	var $redoButtonElement = $('[data-editor-redo]');
	var $closeButtonElement = $('[data-editor-close]');
	var $confirmCloseModalElement = $('[data-editor-confirm-close-modal]');
	var $confirmCloseOkButtonElement = $('[data-editor-confirm-close-ok]');
	var iframeSrc = $previewElement.data('src');
	var engineName = $previewElement.data('editor-preview');
	var engine = engines[engineName];
	var templateName = 'index';

	var adapterConfig = parseAdapterConfig($adapterConfigElement);
	var currentSiteModel = parseSiteModel($previewDataElement);
	var currentThemeConfigOverrides = null;
	var rerenderPreview = null;
	var previewUrl = getPreviewUrl(iframeSrc);

	showLoadingIndicator($previewElement);
	initPreview(currentSiteModel, previewUrl, engine, templateName, function(error, rerender) {
		if (error) { throw error; }
		rerenderPreview = rerender;
		hideLoadingIndicator($previewElement);
		initInlineUploads($previewElement, adapterConfig);
	});
	initLiveUpdates({ throttle: engine.throttle }, function(formValues) {
		currentThemeConfigOverrides = formValues.theme.config;
		setTimeout(function() {
			updatePreview(currentSiteModel, currentThemeConfigOverrides);
		});
	});


	function showLoadingIndicator($previewElement) {
		$previewElement.addClass('loading');
	}

	function hideLoadingIndicator($previewElement) {
		$previewElement.removeClass('loading');
	}

	function parseAdapterConfig($adapterConfigElement) {
		var json = $adapterConfigElement.val() || null;
		return (json ? parseJson(json) : null);
	}

	function parseSiteModel($previewDataElement) {
		var json = $previewDataElement.text() || null;
		return (json ? parseJson(json) : null);
	}

	function getPreviewUrl(previewUrl, params) {
		if (!previewUrl) { return null; }
		if (!params) { return previewUrl; }
		var baseUrl = previewUrl.split('#')[0].split('?')[0];
		return baseUrl + '?' + serializeQueryParams(params);
	}

	function initPreview(siteModel, previewUrl, templateEngine, templateName, callback) {
		loadSiteModel(siteModel, previewUrl)
			.then(function(siteModel) {
				currentSiteModel = siteModel;
				var previewIframeElement = $previewElement[0];
				var iframeDocumentElement = getIframeDomElement(previewIframeElement);
				removeAllChildren(iframeDocumentElement);
				var context = getCustomizedSiteModel(currentSiteModel, currentThemeConfigOverrides);
				engine.render(templateName, context, previewIframeElement, callback);
			});


		function loadSiteModel(siteModel, previewUrl) {
			if (siteModel) { return new $.Deferred().resolve(siteModel).promise(); }
			return loadJson(previewUrl);
		}
	}

	function updatePreview(siteModel, themeConfig) {
		var customizedSiteModel = getCustomizedSiteModel(siteModel, themeConfig);
		if (rerenderPreview) { rerenderPreview(customizedSiteModel); }
	}

	function getCustomizedSiteModel(siteModel, themeConfig) {
		if (!themeConfig) { return siteModel; }
		return merge({}, siteModel, {
			metadata: {
				theme: {
					config: themeConfig
				}
			}
		});
	}

	function initLiveUpdates(options, updateCallback) {
		options = options || {};
		var throttle = options.throttle || null;
		var initialFormValues = getFormFieldValues($formElement);
		initLiveEditorState(initialFormValues, { throttle: throttle }, updateCallback);
		initUnsavedChangesWarning(initialFormValues);


		function initLiveEditorState(initialFormValues, options, updateCallback) {
			options = options || {};
			var throttle = options.throttle || null;
			var formUndoHistory = new HistoryStack();
			formUndoHistory.add(initialFormValues);
			$formElement.on('input', throttle ? debounce(onFormFieldChanged, options.throttle) : onFormFieldChanged);
			$formElement.on('change', onFormFieldChanged);
			$undoButtonElement.on('click', onUndoButtonClicked);
			$redoButtonElement.on('click', onRedoButtonClicked);
			Mousetrap.bind('mod+z', onCtrlZPressed);
			Mousetrap.bind('mod+shift+z', onCtrlShiftZPressed);


			function setFormFieldValues($formElement, fieldValues) {
				var flattenedFieldValues = getFlattenedPropertyValues(fieldValues);
				updateFormValues($formElement, flattenedFieldValues);


				function getFlattenedPropertyValues(nestedValues) {
					return flattenObjectKeys(nestedValues, '');

					function flattenObjectKeys(object, keyPrefix) {
						return Object.keys(object).reduce(function(flattenedValues, key) {
							var propertyValue = object[key];
							var isNestedObject = propertyValue && (typeof propertyValue === 'object');
							if (isNestedObject) {
								var childKeyPrefix = keyPrefix + key + '.';
								objectAssign(flattenedValues, flattenObjectKeys(propertyValue, childKeyPrefix));
							} else {
								flattenedValues[keyPrefix + key] = propertyValue;
							}
							return flattenedValues;
						}, {});
					}
				}

				function updateFormValues($formElement, fieldValues) {
					var fieldElements = Array.prototype.slice.call($formElement.prop('elements'));
					fieldElements.forEach(function(element) {
						var elementName = element.name;
						if (elementName in fieldValues) {
							var fieldValue = fieldValues[elementName];
							element.value = fieldValue;
						}
					});
				}
			}

			function onFormFieldChanged(event) {
				var $formElement = $(event.currentTarget);
				var formValues = getFormFieldValues($formElement);
				var hasChanged = !isEqual(formValues, formUndoHistory.getState());
				if (!hasChanged) { return; }
				if (event.type === 'change') {
					formUndoHistory.add(formValues);
					updateUndoRedoButtonState();
				}
				updateCallback(formValues);
			}

			function onUndoButtonClicked(event) {
				undo();
			}

			function onRedoButtonClicked(event) {
				redo();
			}

			function onCtrlZPressed(event) {
				event.stopImmediatePropagation();
				event.preventDefault();
				var isUndoDisabled = !formUndoHistory.getHasPrevious();
				if (isUndoDisabled) { return; }
				undo();
			}

			function onCtrlShiftZPressed(event) {
				event.preventDefault();
				event.stopImmediatePropagation();
				var isRedoDisabled = !formUndoHistory.getHasNext();
				if (isRedoDisabled) { return; }
				redo();
			}

			function undo() {
				formUndoHistory.previous();
				updateUndoRedoButtonState();
				var formValues = formUndoHistory.getState();
				setFormFieldValues($formElement, formValues);
				updateCallback(formValues);
			}

			function redo() {
				formUndoHistory.next();
				updateUndoRedoButtonState();
				var formValues = formUndoHistory.getState();
				setFormFieldValues($formElement, formValues);
				updateCallback(formValues);
			}

			function updateUndoRedoButtonState() {
				var isUndoDisabled = !formUndoHistory.getHasPrevious();
				var isRedoDisabled = !formUndoHistory.getHasNext();
				$undoButtonElement.prop('disabled', isUndoDisabled);
				$redoButtonElement.prop('disabled', isRedoDisabled);
			}
		}

		function initUnsavedChangesWarning(initialFormValues) {
			$confirmCloseModalElement.modal({
				show: false
			}).on('shown.bs.modal', function(event) {
				$confirmCloseOkButtonElement.focus();
			});
			var targetUrl = null;
			$closeButtonElement.on('click', onCloseButtonClicked);
			$confirmCloseOkButtonElement.on('click', onConfirmCloseOkButtonClicked);
			$(window).on('beforeunload', onBeforeUnload);
			$formElement.on('submit', function() {
				removeBeforeUnloadListener();
			});


			function onCloseButtonClicked(event) {
				var hasUnsavedChanges = getHasUnsavedChanges($formElement);
				if (hasUnsavedChanges) {
					event.preventDefault();
					var $linkElement = $(event.currentTarget);
					targetUrl = $linkElement.attr('href');
					$confirmCloseModalElement.modal('show');
					$confirmCloseOkButtonElement.focus();
				}
			}

			function onConfirmCloseOkButtonClicked(event) {
				removeBeforeUnloadListener();
				document.location.href = targetUrl;
			}

			function removeBeforeUnloadListener() {
				$(window).off('beforeunload', onBeforeUnload);
			}

			function onBeforeUnload(event) {
				var hasUnsavedChanges = getHasUnsavedChanges($formElement);
				if (!hasUnsavedChanges) { return; }
				if (hasUnsavedChanges) {
					return 'You have unsaved changes.';
				}
			}

			function getHasUnsavedChanges($formElement) {
				var formValues = getFormFieldValues($formElement);
				var hasUnsavedChanges = !isEqual(formValues, initialFormValues);
				return hasUnsavedChanges;
			}
		}
	}

	function initInlineUploads($previewElement, adapterConfig) {
		if (!adapterConfig) { return; }
		var $progressElement = $('[data-editor-progress]');
		var $progressLabelElement = $('[data-editor-progress-label]');
		var $progressBarElement = $('[data-editor-progress-bar]');
		var $progressCancelButtonElement = $('[data-editor-progress-cancel]');
		var $uploadStatusModalElement = $('[data-editor-upload-status-modal]');
		var shuntApi = window.shunt;
		var activeUpload = null;
		var showUploadStatus = initUploadStatusModal($uploadStatusModalElement);
		initUploadHotspots($previewElement, onFilesSelected);
		$progressCancelButtonElement.on('click', onUploadCancelRequested);


		function initUploadStatusModal($element) {
			var $modalElement = $element.modal({
				show: false
			});
			var $bodyElement = $modalElement.find('.modal-body');
			var bodyTemplate = $bodyElement.children().remove().text();
			var bodyTemplateFunction = template(bodyTemplate);
			return function showUploadStatus(context) {
				var html = bodyTemplateFunction(context);
				$bodyElement.html(html);
				$modalElement.modal('show');
			};
		}

		function initUploadHotspots($previewIframeElement, uploadCallback) {
			var previewIframeElement = $previewIframeElement[0];
			onIframeDomReady(previewIframeElement)
				.then(function(previewDocument) {
					var $previewDocument = $(previewDocument);
					disableContextMenu($previewDocument);
					addHotspotListeners($previewDocument, '[data-admin-upload]', uploadCallback);
				});


			function disableContextMenu($document) {
				$document.on('contextmenu', function(event) {
					event.preventDefault();
				});
			}

			function addHotspotListeners($element, selector, uploadCallback) {
				var $activeDropTarget = null;
				$element
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
							uploadCallback(prefixedFiles);


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

			function uploadFiles(files, shuntApi, adapterConfig) {
				showUploadProgressIndicator();
				var upload = shuntApi.uploadFiles(files, {
					adapter: adapterConfig,
					retries: NUM_UPLOAD_RETRIES
				});
				upload
					.progress(function(uploadBatch) {
						setUploadProgress(uploadBatch);
					})
					.then(function(uploadBatch) {
						var hasErrors = uploadBatch.numFailed > 0;
						if (hasErrors) {
							showUploadStatus({
								error: null,
								upload: uploadBatch
							});
						}
					})
					.fail(function(error) {
						showUploadStatus({
							error: error,
							upload: null
						});
					})
					.always(function() {
						loadJson(previewUrl)
							.then(function(siteModel) {
								currentSiteModel = siteModel;
								updatePreview(currentSiteModel, currentThemeConfigOverrides);
							})
							.always(function() {
								hideUploadProgressIndicator();
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
					$progressLabelElement.text(message || '');
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

				function setUploadProgress(uploadBatch) {
					var currentFilename = uploadBatch.currentItem && uploadBatch.currentItem.filename || null;
					setProgressBarLabel(currentFilename);
					setProgressBarValue({
						loaded: uploadBatch.bytesLoaded,
						total: uploadBatch.bytesTotal
					});
				}
			}
		}

		function onUploadCancelRequested(event) {
			if (activeUpload) { activeUpload.abort(); }
		}
	}
}
