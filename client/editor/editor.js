'use strict';

var path = require('path');
var junk = require('junk');
var template = require('lodash.template');
var merge = require('lodash.merge');
var isEqual = require('lodash.isequal');
var mime = require('simple-mime')(null);
var Mousetrap = require('mousetrap');
var Handlebars = require('handlebars');

var getIframeDomElement = require('./utils/getIframeDomElement');
var onIframeDomReady = require('./utils/onIframeDomReady');
var removeAllChildren = require('./utils/removeAllChildren');
var appendScriptElement = require('./utils/appendScriptElement');
var loadJson = require('./utils/loadJson');
var parseJson = require('./utils/parseJson');
var getFormFieldValues = require('./utils/getFormFieldValues');
var setFormFieldValues = require('./utils/setFormFieldValues');

var parseThemeConfigDefaults = require('../../src/utils/parseThemeConfigDefaults');
var serializeQueryParams = require('../../src/utils/serializeQueryParams');
var handlebarsHelpers = require('../../src/engines/handlebars/helpers/index');

var HistoryStack = require('./lib/HistoryStack');

window.Handlebars = merge(Handlebars, window.Handlebars, {
	templates: {},
	partials: {}
});

var engines = require('./engines');

var TEMPLATE_ID_INDEX = 'index';
var NUM_UPLOAD_RETRIES = 2;

$(function() {
	initToggleButtons();
	initColorpickers();
	initSidepanel();
	initLivePreview(function(error) {
		if (error) { return; }
		startTour();
	});
});


function initToggleButtons() {
	$('[data-toggle="buttons"] label input')
		.on('change', function(event) {
			var $element = $(event.currentTarget);
			var isChecked = $element.prop('checked');
			$element.closest('label').toggleClass('active', isChecked);
		});
}

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
		$(window).trigger('resize');
	});

	var shouldStartCollapsed = (window.innerWidth < 768);
	$('#editor-sidepanel').toggleClass('collapsed', shouldStartCollapsed).removeClass('loading');
}

function initLivePreview(callback) {
	var $formElement = $('[data-editor]');
	var $adapterConfigElement = $('[data-editor-adapter-config]');
	var $themeMetadataUrlElement = $('[data-editor-theme-metadata-url]');
	var $themeTemplateUrlElement = $('[data-editor-theme-template-url]');
	var $themeRootUrlElement = $('[data-editor-theme-root-url]');
	var $previewElement = $('[data-editor-preview]');
	var $previewDataElement = $('[data-editor-preview-data]');
	var $themeOptionsPanelElement = $('#theme-options');
	var $sidepanelElement = $('#editor-sidepanel');
	var $controlsElement = $('[data-editor-controls]');
	var $undoButtonElement = $('[data-editor-undo]');
	var $redoButtonElement = $('[data-editor-redo]');
	var $resetButtonElement = $('input[type="reset"],button[type="reset"]');
	var $closeButtonElement = $('[data-editor-close]');
	var $confirmCloseModalElement = $('[data-editor-confirm-close-modal]');
	var $confirmCloseOkButtonElement = $('[data-editor-confirm-close-ok]');
	var iframeSrc = $previewElement.data('src');
	var engineName = $previewElement.data('editor-preview');
	var templateId = TEMPLATE_ID_INDEX;
	var precompiledThemeOptionsTemplate = Handlebars.templates['theme-options'];
	var themeOptionsTemplateFunction = createHandlebarsTemplateFunction(precompiledThemeOptionsTemplate);

	var adapterConfig = parseAdapterConfig($adapterConfigElement);
	var themeMetadataUrlPattern = $themeMetadataUrlElement.val();
	var themeTemplateUrlPattern = $themeTemplateUrlElement.val();
	var themeRootUrlPattern = $themeRootUrlElement.val();
	var currentSiteModel = parseSiteModel($previewDataElement);
	var currentThemeOverrides = getFormFieldValues($formElement).theme;
	var rerenderPreview = null;
	var previewUrl = getPreviewUrl(iframeSrc);
	var undoHistory = new HistoryStack();
	var currentAction = null;

	showLoadingIndicator($formElement);
	showLoadingIndicator($previewElement);
	disableControls($controlsElement);
	var engine = engines[engineName];
	var throttle = engine.throttle;
	initPreview(currentSiteModel, null, previewUrl, engine, templateId, function(error, rerender) {
		if (error) {
			showErrorIndicator($formElement);
			return;
		}
		onPreviewLoaded(error, rerender);
		hideLoadingIndicator($previewElement);
		hideLoadingIndicator($formElement);
		enableControls($controlsElement);
		callback(error);
	});
	initLiveUpdates(function(formValues, options) {
		currentAction = waitForAction(currentAction).then(function() {
			return applyUpdates(formValues, options);
		});


		function waitForAction(action) {
			if (!action) { return new $.Deferred().resolve().promise(); }
			return action;
		}
	});

	function createHandlebarsTemplateFunction(precompiledTemplate) {
		if (!precompiledTemplate) { return null; }
		var compiler = Handlebars.create();
		compiler.registerHelper(handlebarsHelpers);
		var templateFunction = compiler.template(precompiledTemplate);
		return templateFunction;
	}

	function onPreviewLoaded(error, rerender) {
		if (error) { throw error; }
		rerenderPreview = rerender;
		initUploads(adapterConfig);
	}

	function showLoadingIndicator($element) {
		$element.addClass('loading');
	}

	function hideLoadingIndicator($element) {
		$element.removeClass('loading');
	}

	function showErrorIndicator($element) {
		$element.addClass('error');
	}

	function disableControls($element) {
		$element.prop('disabled', true);
	}

	function enableControls($element) {
		$element.prop('disabled', false);
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

	function getThemeMetadataUrl(themeId) {
		return themeMetadataUrlPattern.replace(':theme', themeId);
	}

	function getThemeTemplateUrl(themeId) {
		return themeTemplateUrlPattern.replace(':theme', themeId);
	}

	function getThemeRootUrl(themeId) {
		return themeRootUrlPattern.replace(':theme', themeId);
	}

	function initPreview(siteModel, themeOverrides, previewUrl, templateEngine, templateId, callback) {
		retrieveSiteModel(siteModel, themeOverrides, previewUrl)
			.then(function(customizedSiteModel) {
				currentSiteModel = customizedSiteModel;
				var themeId = customizedSiteModel.metadata.theme.id;
				var previewIframeElement = $previewElement[0];
				var iframeDocumentElement = getIframeDomElement(previewIframeElement);
				removeAllChildren(iframeDocumentElement);
				try {
					templateEngine.render(themeId, templateId, customizedSiteModel, previewIframeElement, callback);
				} catch(error) {
					callback(error);
				}
			})
			.fail(function(error) {
				callback(error);
			});


		function retrieveSiteModel(siteModel, themeOverrides, previewUrl) {
			var themeHasChanged = siteModel && themeOverrides && themeOverrides.id && (themeOverrides.id !== siteModel.metadata.theme.id);
			if (siteModel && !themeHasChanged) {
				var customizedSiteModel = getCustomizedSiteModel(siteModel, themeOverrides);
				return new $.Deferred().resolve(customizedSiteModel).promise();
			} else {
				return loadSiteModel(siteModel, themeOverrides, previewUrl);
			}
		}
	}

	function loadSiteModel(siteModel, themeOverrides, previewUrl) {
		var customizedPreviewUrl = (themeOverrides ? getPreviewUrl(previewUrl, {
			'theme.id': themeOverrides.id,
			'theme.config': themeOverrides.config
		}) : previewUrl);
		return loadJson(customizedPreviewUrl);
	}

	function applyUpdates(formValues, options) {
		var deferred = new $.Deferred();
		var isUserInitiatedAction = Boolean(options.userInitiated);
		var themeOverrides = formValues.theme;
		var themeHasChanged = (themeOverrides.id !== currentSiteModel.metadata.theme.id);
		if (themeHasChanged) {
			if (isUserInitiatedAction) {
				formValues.theme.config = null;
				undoHistory.replace(formValues);
			}
			$themeOptionsPanelElement.empty();
			currentThemeOverrides = null;
			disableControls($controlsElement);
			showLoadingIndicator($formElement);
			showLoadingIndicator($sidepanelElement);
			showLoadingIndicator($previewElement);
			updateTheme(currentSiteModel, themeOverrides, function(error, siteModel) {
				if (error) {
					showErrorIndicator($formElement);
					deferred.reject(error);
					return;
				}
				currentThemeOverrides = siteModel.metadata.theme.config;
				if (isUserInitiatedAction) {
					formValues.theme.config = siteModel.metadata.theme.config;
					undoHistory.replace({
						theme: {
							id: siteModel.metadata.theme.id,
							config: siteModel.metadata.theme.config
						}
					});
				}
				hideLoadingIndicator($sidepanelElement);
				hideLoadingIndicator($previewElement);
				hideLoadingIndicator($formElement);
				enableControls($controlsElement);
				deferred.resolve();
			});
		} else {
			setTimeout(function() {
				updatePreview(currentSiteModel, themeOverrides);
				deferred.resolve();
			});
		}
		return deferred.promise();
	}


	function updatePreview(siteModel, themeOverrides) {
		currentSiteModel = siteModel;
		currentThemeOverrides = themeOverrides;
		var customizedSiteModel = getCustomizedSiteModel(siteModel, themeOverrides);
		if (rerenderPreview) { rerenderPreview(customizedSiteModel); }
	}

	function getCustomizedSiteModel(siteModel, themeOverrides) {
		if (!themeOverrides) { return siteModel; }
		return merge({}, siteModel, {
			metadata: {
				theme: themeOverrides
			}
		});
	}

	function updateTheme(siteModel, themeOverrides, callback) {
		var themeId = themeOverrides.id;
		var themeMetadataUrl = getThemeMetadataUrl(themeId);
		var themeTemplateUrl = getThemeTemplateUrl(themeId);
		var themeRootUrl = getThemeRootUrl(themeId);
		loadJson(themeMetadataUrl)
			.then(function(theme) {
				var themeConfigSchema = theme.config;
				var themeConfigDefaults = parseThemeConfigDefaults(themeConfigSchema);
				var themeConfig = (themeOverrides.config ? merge({}, themeConfigDefaults, themeOverrides.config) : themeConfigDefaults);
				siteModel.metadata.themeRoot = themeRootUrl;
				siteModel.metadata.theme = {
					id: themeId,
					config: themeConfig
				};
				var themeEngine = theme.templates.index.engine;
				var engine = engines[themeEngine];
				redrawThemeOptions(theme, siteModel, $themeOptionsPanelElement);
				return loadThemeTemplate(themeTemplateUrl)
					.then(function() {
						var themeOverrides = { id: themeId };
						initPreview(currentSiteModel, themeOverrides, previewUrl, engine, templateId, function(error, rerender) {
							if (error) {
								return callback(error);
							}
							onPreviewLoaded(error, rerender);
							throttle = engine.throttle;
							callback(null, siteModel);
						});
					});
			})
			.fail(function(error) {
				callback(error);
			});

			function redrawThemeOptions(theme, siteModel, $parentElement) {
				var themeOptionsHtml = themeOptionsTemplateFunction({
					theme: theme,
					config: siteModel.metadata.theme.config
				});
				$parentElement.empty().append(themeOptionsHtml);
				initColorpickers();
				initAccordions($parentElement);
			}

			function loadThemeTemplate(themeTemplateUrl) {
				return appendScriptElement(themeTemplateUrl, document.body);
			}

			function initAccordions($parentElement) {
				$parentElement.collapse({ parent: true, toggle: true });
				$('[data-fixed-accordion]').fixedAccordion();
			}
	}


	function initLiveUpdates(updateCallback) {
		var initialFormValues = getFormFieldValues($formElement);
		initLiveEditorState(initialFormValues, updateCallback);
		initUnsavedChangesWarning(initialFormValues);


		function initLiveEditorState(initialFormValues, updateCallback) {
			var previousState = initialFormValues;
			var isUpdating = false;
			var throttleTimeout = null;
			undoHistory.add(initialFormValues);
			$formElement.on('reset', onFormReset);
			$formElement.on('input', onFormFieldChanged);
			$formElement.on('change', onFormFieldChanged);
			preventEnterKeyFormSubmission($formElement);
			$undoButtonElement.on('click', onUndoButtonClicked);
			$redoButtonElement.on('click', onRedoButtonClicked);
			Mousetrap.bind('mod+z', onUndoPressed);
			Mousetrap.bind(['mod+shift+z', 'ctrl+y'], onRedoPressed);
			updateUndoRedoButtonState();


			function onFormReset(event) {
				isUpdating = true;
				setTimeout(function() {
					isUpdating = false;
					var $formElement = $(event.currentTarget);
					var formValues = getFormFieldValues($formElement);
					var hasChanged = !isEqual(formValues, previousState);
					if (!hasChanged) { return; }
					previousState = formValues;
					undoHistory.add(formValues);
					updateUndoRedoButtonState();
					updateCallback(formValues, { userInitiated: true });
				});
			}

			function onFormFieldChanged(event, forceUpdate) {
				var inputElement = event.target;
				var isThemeSettingsField = /^theme\./.test(inputElement.name);
				if (!isThemeSettingsField) { return; }
				if (isUpdating) { return; }
				if ((inputElement.tagName === 'SELECT') && (event.type === 'input')) { return; }
				if ((event.type === 'input') && getIsMobile()) { return; }
				if (throttle) {
					if (throttleTimeout) {
						clearTimeout(throttleTimeout);
						throttleTimeout = null;
					}
					var isThrottled = (event.type === 'input');
					if (isThrottled && !forceUpdate) {
						throttleTimeout = setTimeout(function() {
							throttleTimeout = null;
							onFormFieldChanged(event, true);
						}, throttle);
						return;
					}
				}
				var $formElement = $(event.currentTarget);
				var formValues = getFormFieldValues($formElement);
				var hasChanged = !isEqual(formValues, previousState);
				if (hasChanged) {
					previousState = formValues;
				}
				if (event.type === 'change') {
					undoHistory.add(formValues);
					updateUndoRedoButtonState();
				} else {
					updateResetButtonState();
				}
				if (hasChanged) {
					updateCallback(formValues, { userInitiated: true });
				}
			}

			function preventEnterKeyFormSubmission($formElement) {
				$formElement.on('keypress', onFormKeyPressed);


				function onFormKeyPressed(event) {
					var KEYCODE_ENTER = 13;
					if (event.keyCode !== KEYCODE_ENTER) { return; }
					var inputElement = event.target;
					if (inputElement.tagName === 'TEXTAREA') { return; }
					var isThemeSettingsField = /^theme\./.test(inputElement.name);
					if (!isThemeSettingsField) { return; }
					event.preventDefault();
				}
			}

			function getIsMobile() {
				return (document.documentElement.clientWidth < 768);
			}

			function onUndoButtonClicked(event) {
				undo();
			}

			function onRedoButtonClicked(event) {
				redo();
			}

			function onUndoPressed(event) {
				event.stopImmediatePropagation();
				event.preventDefault();
				var isUndoDisabled = !undoHistory.getHasPrevious();
				if (isUndoDisabled) { return; }
				undo();
			}

			function onRedoPressed(event) {
				event.preventDefault();
				event.stopImmediatePropagation();
				var isRedoDisabled = !undoHistory.getHasNext();
				if (isRedoDisabled) { return; }
				redo();
			}

			function undo() {
				undoHistory.previous();
				var formValues = undoHistory.getState();
				isUpdating = true;
				setFormFieldValues($formElement, formValues);
				isUpdating = false;
				previousState = formValues;
				updateUndoRedoButtonState();
				updateCallback(formValues, { userInitiated: false });
			}

			function redo() {
				undoHistory.next();
				var formValues = undoHistory.getState();
				isUpdating = true;
				setFormFieldValues($formElement, formValues);
				isUpdating = false;
				previousState = formValues;
				updateUndoRedoButtonState();
				updateCallback(formValues, { userInitiated: false });
			}

			function updateUndoRedoButtonState() {
				var isUndoDisabled = !undoHistory.getHasPrevious();
				var isRedoDisabled = !undoHistory.getHasNext();
				$undoButtonElement.prop('disabled', isUndoDisabled);
				$redoButtonElement.prop('disabled', isRedoDisabled);
				updateResetButtonState();
			}

			function updateResetButtonState() {
				var hasChanges = !isEqual(previousState, initialFormValues);
				$resetButtonElement.prop('disabled', !hasChanges);
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

	function initUploads(adapterConfig) {
		if (!adapterConfig) { return; }
		var $progressElement = $('[data-editor-progress]');
		var $progressLabelElement = $('[data-editor-progress-label]');
		var $progressBarElement = $('[data-editor-progress-bar]');
		var $progressCancelButtonElement = $('[data-editor-progress-cancel]');
		var $uploadStatusModalElement = $('[data-editor-upload-status-modal]');

		var filecanvasApi = window.filecanvas;
		var showUploadStatus = initUploadStatusModal($uploadStatusModalElement);
		var activeUpload = null;

		initFileUploads(uploadFiles);
		initInlineUploads($previewElement, uploadFiles);

		$progressCancelButtonElement.off('click').on('click', onUploadCancelRequested);


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

		function initFileUploads(uploadCallback) {
			var $fileInputElements = $('[data-editor-upload]');
			$fileInputElements.on('change', function(event) {
				var fileInputElement = event.currentTarget;
				var files = Array.prototype.slice.call(fileInputElement.files)
					.map(function(file) {
						return {
							path: file.name,
							data: file
						};
					});
				$(fileInputElement).val('');
				uploadCallback(files);
			});
		}

		function initInlineUploads($previewElement, uploadCallback) {
			initUploadHotspots($previewElement, uploadCallback);


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
								loadDataTransferItems(dataTransfer.items, function(files) {
									uploadCallback(files, { path: pathPrefix });
								});
							} else if (dataTransfer.files) {
								var files = Array.prototype.slice.call(dataTransfer.files)
									.map(function(file) {
										return {
											path: file.name,
											data: file
										};
									});
								uploadCallback(files, { path: pathPrefix });
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
				}
			}
		}

		function onUploadCancelRequested(event) {
			if (activeUpload) { activeUpload.abort(); }
		}

		function uploadFiles(files, options) {
			options = options || {};
			var pathPrefix = options.path || '';
			var filteredFiles = getFilteredFiles(files);
			var prefixedFiles = filteredFiles.map(function(file) {
				return {
					path: pathPrefix + '/' + file.path,
					data: file.data
				};
			});

			var isUploadInProgress = Boolean(activeUpload);
			if (isUploadInProgress) {
				activeUpload.append(prefixedFiles);
			} else {
				activeUpload = startUpload(prefixedFiles, filecanvasApi, adapterConfig);
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

			function startUpload(files, filecanvasApi, adapterConfig) {
				showUploadProgressIndicator();
				var upload = filecanvasApi.uploadFiles(files, {
					adapter: adapterConfig,
					retries: NUM_UPLOAD_RETRIES
				});
				var numLoaded = 0;
				upload
					.progress(function(uploadBatch) {
						setUploadProgress(uploadBatch);
						if (uploadBatch.numLoaded !== numLoaded) {
							numLoaded = uploadBatch.numLoaded;
							mergeFiles(uploadBatch.completedItems, currentSiteModel.resource.root);
							updatePreview(currentSiteModel, currentThemeOverrides);
						}
					})
					.then(function(uploadBatch) {
						if (uploadBatch.numLoaded !== numLoaded) {
							numLoaded = uploadBatch.numLoaded;
							mergeFiles(uploadBatch.completedItems, currentSiteModel.resource.root);
							updatePreview(currentSiteModel, currentThemeOverrides);
						}
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
						hideUploadProgressIndicator();
						var siteModel = null;
						var themeOverrides = { id: currentThemeOverrides.id };
						(previewUrl ?
							loadSiteModel(siteModel, themeOverrides, previewUrl)
								.then(function(siteModel) {
									updatePreview(siteModel, currentThemeOverrides);
								})
							:
							new $.Deferred().resolve().promise()
						)
							.always(function() {
								hideUploadProgressIndicator();
							});
					});
				return upload;


				function mergeFiles(completedItems, siteRoot) {
					completedItems.forEach(function(item) {
						var updatedFilename = item.filename;
						var filePath = item.file.path.split('/').slice(0, -1).concat(updatedFilename).join('/');
						insertFile(item.file.data, filePath, siteRoot);
					});


					function insertFile(file, filePath, rootFolder) {
						var pathSegments = filePath.substr('/'.length).split('/');
						if (pathSegments.length > 1) {
							var parentFilename = pathSegments[0];
							var childPath = pathSegments.slice(1).join('/');
							var parentFolder = getChildFile(rootFolder, parentFilename) || createFolderModel(rootFolder, parentFilename, file.lastModifiedDate);
							return insertFile(file, '/' + childPath, parentFolder);
						} else {
							var filename = pathSegments[0];
							return createFileModel(rootFolder, filename, file);
						}

						function getChildFile(parentFolder, filename) {
							var filePath = getChildPath(parentFolder.path, filename);
							return parentFolder.contents.filter(function(file) {
								return file.path === filePath;
							})[0] || null;
						}

						function getChildPath(parentPath, filename) {
							return (parentPath === '/' ? '' : parentPath) + '/' + filename;
						}

						function createFolderModel(parentFolder, folderName, modifiedDate) {
							var folderPath = getChildPath(parentFolder.path, folderName);
							var folderModel = {
								path: folderPath,
								mimeType: null,
								size: 0,
								modified: modifiedDate.toISOString(),
								thumbnail: false,
								directory: true,
								contents: []
							};
							parentFolder.contents.push(folderModel);
							return folderModel;
						}

						function createFileModel(parentFolder, filename, file) {
							var filePath = getChildPath(parentFolder.path, filename);
							var fileModel = {
								path: filePath,
								mimeType: mime(filename),
								size: file.size,
								modified: file.lastModifiedDate.toISOString(),
								thumbnail: getHasThumbnail(file),
								directory: false
							};
							addFile(parentFolder, fileModel);
							return fileModel;


							function getHasThumbnail(file) {
								var extension = path.extname(file.name).substr('.'.length);
								var IMAGE_TYPES = [
									'jpg',
									'jpeg',
									'png',
									'gif'
								];
								return IMAGE_TYPES.indexOf(extension) !== -1;
							}

							function addFile(parentFolder, file) {
								var existingFile = parentFolder.contents.filter(function(existingFile) {
									return existingFile.path === file.path;
								})[0] || null;
								if (existingFile) {
									var existingFileIndex = parentFolder.contents.indexOf(existingFile);
									parentFolder.contents.splice(existingFileIndex, 1, file);
								} else {
									parentFolder.contents.push(file);
								}
							}
						}
					}
				}

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
	}

}

function startTour() {
	var DEMO_EDITOR_PATH = '/editor';
	var DEMO_ADD_FILES_PATH = '/editor/add-files';
	var SITE_EDITOR_PATH = /^\/canvases\/[^\/]+\/edit$/;

	var TOUR_ID_DEMO_EDITOR = 'demo-tour';
	var TOUR_ID_DEMO_ADD_FILES = 'demo-add-files-tour';
	var TOUR_ID_SITE_EDITOR = 'edit-tour';

	var currentPath = document.location.pathname;
	var tourId = getTourId(currentPath);
	var tourSteps = getTourSteps(tourId);
	var currentTourSteps = getTourStepsForViewport(tourSteps, window);
	var isDemoTour = (tourId === TOUR_ID_DEMO_EDITOR) || (tourId === TOUR_ID_DEMO_ADD_FILES);

	$(window).on('resize', onWindowResized);

	var tour = new window.Tour({
		name: tourId,
		steps: currentTourSteps,
		storage: (isDemoTour ? window.sessionStorage : window.localStorage)
	});
	tour.init();
	tour.start();


	function onWindowResized(event) {
		var updatedTourSteps = getTourStepsForViewport(tourSteps, window);
		if (isEqual(updatedTourSteps, currentTourSteps)) { return; }
		Array.prototype.splice.apply(currentTourSteps, [0, currentTourSteps.length].concat(updatedTourSteps));
	}

	function getTourStepsForViewport(tourSteps, viewport) {
		var viewportWidth = $(window).width();
		var isMobile = (viewportWidth < 768);
		var isDesktop = !isMobile;
		return tourSteps
			.filter(function(step) {
				return !(isMobile && (step.mobile === false)) && !(isDesktop && (step.desktop === false));
			})
			.map(function(step, index, steps) {
				var stepIndex = (index + 1);
				var numSteps = steps.length;
				var progress = stepIndex / steps.length;
				var title = step.title + '<span class="pull-right">' + stepIndex + '/' + numSteps + '</span>';
				var content = '<div class="popover-progress bg-default"><div class="popover-progress-bar bg-primary" style="width:' + (progress * 100) + '%;"></div></div>' + step.content;
				var placement = ((typeof step.placement === 'object') ? (isDesktop ? step.placement.desktop : step.placement.mobile) : step.placement);
				var hasChanged = (title !== step.title) || (content !== step.content) || (placement !== step.placement);
				if (!hasChanged) { return step; }
				return merge({}, step, {
					title: title,
					content: content,
					placement: placement
				});
			});
	}

	function getTourId(pathname) {
		if (getIsMatch(pathname, DEMO_EDITOR_PATH)) {
			return TOUR_ID_DEMO_EDITOR;
		} else if (getIsMatch(pathname, DEMO_ADD_FILES_PATH)) {
			return TOUR_ID_DEMO_ADD_FILES;
		} else if (getIsMatch(pathname, SITE_EDITOR_PATH)) {
			return TOUR_ID_SITE_EDITOR;
		} else {
			return null;
		}


		function getIsMatch(value, filter) {
			if (typeof filter === 'string') {
				return value === filter;
			} else if (filter instanceof RegExp) {
				return filter.test(value);
			} else if (typeof filter === 'function') {
				return filter(value);
			} else if (Array.isArray(filter)) {
				return filter.some(function(filter) {
					return getIsMatch(value, filter);
				});
			} else {
				return false;
			}
		}
	}

	function getTourSteps(tourId) {
		var TOUR_STEPS = [
			{
				element: '#editor-sidepanel',
				placement: {
					mobile: 'bottom',
					desktop: 'right'
				},
				backdrop: true,
				title: 'Theme options',
				content: '<p>Use the Theme Options panel to choose how your canvas looks</p>',
				filter: [
					TOUR_ID_DEMO_EDITOR,
					TOUR_ID_SITE_EDITOR
				]
			},
			{
				element: '.editor-main',
				container: '.editor-main',
				placement: 'top',
				backdrop: true,
				title: 'Upload files',
				content: '<p>Drag files onto the preview area to upload them to your canvas</p>',
				filter: [
					TOUR_ID_DEMO_ADD_FILES,
					TOUR_ID_SITE_EDITOR
				],
				mobile: false
			},
			{
				element: '.title-bar-controls .title-bar-controls-container .editor-file-upload',
				placement: 'top',
				backdrop: true,
				backdropContainer: '.title-bar-controls .title-bar-controls-container',
				title: 'Upload files',
				content: '<p>Click here to upload files to your canvas</p>',
				filter: [
					TOUR_ID_DEMO_ADD_FILES,
					TOUR_ID_SITE_EDITOR
				],
				desktop: false
			},
			{
				element: '.title-bar-controls .title-bar-controls-container button',
				placement: {
					mobile: 'top',
					desktop: 'bottom'
				},
				backdrop: true,
				backdropContainer: '.title-bar-controls .title-bar-controls-container',
				title: 'Add files',
				content: '<p>Once you’re happy with how your canvas looks, click here to add some files</p>',
				filter: [
					TOUR_ID_DEMO_EDITOR
				]
			},
			{
				element: '.title-bar-controls .title-bar-controls-container button[type="submit"]',
				placement: {
					mobile: 'top',
					desktop: 'bottom'
				},
				backdrop: true,
				backdropContainer: '.title-bar-controls .title-bar-controls-container',
				title: 'Save your canvas',
				content: '<p>Once you’re happy with how your canvas looks, click here to save it for publishing later</p>',
				filter: [
					TOUR_ID_DEMO_ADD_FILES
				]
			},
			{
				element: '.title-bar-controls .title-bar-controls-container button[type="submit"]',
				placement: {
					mobile: 'top',
					desktop: 'bottom'
				},
				backdrop: true,
				backdropContainer: '.title-bar-controls .title-bar-controls-container',
				title: 'Save changes',
				content: '<p>Once you’re happy with how your canvas looks, click here to save your changes and leave the editor</p>',
				filter: [
					TOUR_ID_SITE_EDITOR
				]
			},
			{
				element: '#title-bar-toolbar .title-bar-toolbar-container',
				placement: {
					mobile: null,
					desktop: 'bottom'
				},
				backdrop: true,
				backdropPadding: 4,
				title: 'Undo/redo',
				content: 'Use the toolbar to undo any mistakes as you go along',
				filter: [
					TOUR_ID_DEMO_EDITOR,
					TOUR_ID_SITE_EDITOR
				],
				mobile: false
			}
		];

		return TOUR_STEPS.filter(function(step) {
			return !step.filter || (step.filter.indexOf(tourId) !== -1);
		});
	}
}
