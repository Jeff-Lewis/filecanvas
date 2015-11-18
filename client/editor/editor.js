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
var serializeQueryParams = require('./utils/serializeQueryParams');
var getFormFieldValues = require('./utils/getFormFieldValues');
var setFormFieldValues = require('./utils/setFormFieldValues');

var parseThemeConfigDefaults = require('../../src/utils/parseThemeConfigDefaults');
var expandConfigPlaceholders = require('../../src/utils/expandConfigPlaceholders');
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
	initLivePreview();
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
	});
}

function initLivePreview() {
	var $formElement = $('[data-editor-form]');
	var $siteLabelElement = $('[data-editor-site-label]');
	var $adapterConfigElement = $('[data-editor-adapter-config]');
	var $themeMetadataUrlElement = $('[data-editor-theme-metadata-url]');
	var $themeTemplateUrlElement = $('[data-editor-theme-template-url]');
	var $themeRootUrlElement = $('[data-editor-theme-root-url]');
	var $previewElement = $('[data-editor-preview]');
	var $previewDataElement = $('[data-editor-preview-data]');
	var $themeOptionsPanelElement = $('#theme-options');
	var $undoButtonElement = $('[data-editor-undo]');
	var $redoButtonElement = $('[data-editor-redo]');
	var $resetButtonElement = $('input[type="reset"],button[type="reset"]');
	var $closeButtonElement = $('[data-editor-close]');
	var $confirmCloseModalElement = $('[data-editor-confirm-close-modal]');
	var $confirmCloseOkButtonElement = $('[data-editor-confirm-close-ok]');
	var iframeSrc = $previewElement.data('src');
	var engineName = $previewElement.data('editor-preview');
	var templateId = TEMPLATE_ID_INDEX;
	var siteLabel = $siteLabelElement.val();
	var themeOptionsTemplateFunction = createHandlebarsTemplateFunction('theme-options');

	var adapterConfig = parseAdapterConfig($adapterConfigElement);
	var themeMetadataUrlPattern = $themeMetadataUrlElement.val();
	var themeTemplateUrlPattern = $themeTemplateUrlElement.val();
	var themeRootUrlPattern = $themeRootUrlElement.val();
	var currentSiteModel = parseSiteModel($previewDataElement);
	var currentThemeOverrides = getFormFieldValues($formElement).theme;
	var rerenderPreview = null;
	var previewUrl = getPreviewUrl(iframeSrc);
	var undoHistory = new HistoryStack();

	showLoadingIndicator($previewElement);
	var engine = engines[engineName];
	var throttle = engine.throttle;
	initPreview(currentSiteModel, null, previewUrl, engine, templateId, function(error, rerender) {
		onPreviewLoaded(error, rerender);
		hideLoadingIndicator($previewElement);
	});
	initLiveUpdates(function(formValues, options) {
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
			showLoadingIndicator($themeOptionsPanelElement);
			showLoadingIndicator($previewElement);
			updateTheme(currentSiteModel, themeOverrides, function(siteModel) {
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
				hideLoadingIndicator($themeOptionsPanelElement);
				hideLoadingIndicator($previewElement);
			});
		} else {
			setTimeout(function() {
				updatePreview(currentSiteModel, themeOverrides);
			});
		}
	});


	function createHandlebarsTemplateFunction(templateName) {
		var precompiledTemplate = Handlebars.templates[templateName];
		if (!precompiledTemplate) { return null; }
		var compiler = Handlebars.create();
		compiler.registerHelper(handlebarsHelpers);
		var templateFunction = compiler.template(precompiledTemplate);
		return templateFunction;
	}

	function onPreviewLoaded(error, rerender) {
		if (error) { throw error; }
		rerenderPreview = rerender;
		initInlineUploads($previewElement, adapterConfig);
	}

	function showLoadingIndicator($element) {
		$element.addClass('loading');
	}

	function hideLoadingIndicator($element) {
		$element.removeClass('loading');
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
				templateEngine.render(themeId, templateId, customizedSiteModel, previewIframeElement, callback);
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
				var defaultThemeConfig = expandConfigPlaceholders(themeConfigDefaults, {
					site: {
						label: siteLabel
					}
				});
				var themeConfig = (themeOverrides.config ? merge({}, defaultThemeConfig, themeOverrides.config) : defaultThemeConfig);
				siteModel.metadata.themeRoot = themeRootUrl;
				siteModel.metadata.theme = {
					id: themeId,
					config: themeConfig
				};
				var themeEngine = theme.templates.index.engine;
				var engine = engines[themeEngine];
				redrawThemeOptions(theme, siteModel, $themeOptionsPanelElement);
				loadThemeTemplate(themeTemplateUrl)
					.then(function() {
						var themeOverrides = { id: themeId };
						initPreview(currentSiteModel, themeOverrides, previewUrl, engine, templateId, function(error, rerender) {
							onPreviewLoaded(error, rerender);
							throttle = engine.throttle;
							callback(siteModel);
						});
					});
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
			$undoButtonElement.on('click', onUndoButtonClicked);
			$redoButtonElement.on('click', onRedoButtonClicked);
			Mousetrap.bind('mod+z', onCtrlZPressed);
			Mousetrap.bind('mod+shift+z', onCtrlShiftZPressed);
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
				if (isUpdating) { return; }
				if ((event.target.tagName === 'SELECT') && (event.type === 'input')) { return; }
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

			function onUndoButtonClicked(event) {
				undo();
			}

			function onRedoButtonClicked(event) {
				redo();
			}

			function onCtrlZPressed(event) {
				event.stopImmediatePropagation();
				event.preventDefault();
				var isUndoDisabled = !undoHistory.getHasPrevious();
				if (isUndoDisabled) { return; }
				undo();
			}

			function onCtrlShiftZPressed(event) {
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
						loadSiteModel(siteModel, themeOverrides, previewUrl)
							.then(function(siteModel) {
								updatePreview(siteModel, currentThemeOverrides);
							})
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

		function onUploadCancelRequested(event) {
			if (activeUpload) { activeUpload.abort(); }
		}
	}
}
