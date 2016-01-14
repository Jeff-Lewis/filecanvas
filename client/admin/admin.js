'use strict';

var path = require('path');
var slug = require('slug');
var xhr = require('../utils/xhr');
var loadImage = require('../utils/loadImage');

var DEFAULT_VALIDATION_TRIGGERS = 'input change blur';

$(function() {

	var bindingFilters = {
		'slug': function(value) {
			return slug(value, { lower: true });
		},
		'format': function(value, formatString, emptyString) {
			if (!value && (arguments.length >= 3)) { return emptyString; }
			return formatString.replace(/\$0/g, value);
		},
		'filename': function(value) {
			// See https://www.dropbox.com/en/help/145
			return value.replace(/[\/<>:"|?*]/g, '');
		}
	};

	var parsers = {
		'slug': function(value) {
			return value.toLowerCase().replace(/['"‘’“”]/g, '').replace(/[^a-z0-9]+/g, '-');
		}
	};

	var validators = {
		'notEmpty': function(value) {
			return Boolean(value);
		},
		'notEqualTo': function(value, args) {
			var items = Array.prototype.slice.call(arguments, 1);
			return items.every(function(item) {
				return (value !== item);
			});
		},
		'startsWith': function(value, string) {
			return Boolean(value) && (value.substr(0, string.length) === string);
		},
		'endsWith': function(value, string) {
			return Boolean(value) && (value.substr(-string.length) === string);
		},
		'email': function(value) {
			return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,4}$/.test(value);
		},
		'domain': function(value) {
			return /^(?!:\/\/)([a-z0-9]+\.)?[a-z0-9][a-z0-9-]+\.[a-z]{2,6}?$/.test(value);
		},
		'slug': function(value) {
			return (value === bindingFilters['slug'](value));
		},
		'path': function(value) {
			return (value === '') || (value === path.normalize(value));
		},
		'filename': function(value) {
			return (value === bindingFilters['filename'](value));
		}
	};

	initFormSubmitButtons();
	initFormResetButtons();
	initInputParsers(parsers);
	var bindingSources = initBindingSources();
	initBindingTargets(bindingSources, bindingFilters);
	initFilecanvas(bindingSources, bindingFilters);
	updateBindings(bindingSources);
	initInputValidators(validators);
	initSelectAllInputs();
	initFixedAccordions();
	initAccordionAnchors();
	initActionPanels();
	initPathControls();
	initUploadControls();
	initNavigationDropdowns();
	initOffscreenSidebar();
	initModalAutofocus();
	initModalForms();
	initModalAutoload();
	initLogout();
});


function initFormSubmitButtons() {
	var $formElements = $('form');

	$formElements.on('submit', function(event) {
		var $formElement = $(event.currentTarget);
		var $submitElements = $formElement.find('input[type="submit"],button[type="submit"]');
		$submitElements.prop('disabled', true);
	});
}

function initFormResetButtons() {
	var $formElements = $('form');

	$formElements.on('reset', function(event) {
		var $formElement = $(event.currentTarget);
		var sourceAttributeName = 'data-bind-id';
		var validatorAttributeName = 'data-validate';
		var inputTypes = ['input', 'textarea', 'select'];
		var inputSelectors = inputTypes.concat('[' + sourceAttributeName + ']');
		var $sourceElements = $formElement.find(inputSelectors.join(','));
		var $validatedElements = $formElement.find('[' + validatorAttributeName + ']');
		setTimeout(function() {
			$sourceElements.change();
			$validatedElements
				.one('reset', preventEventBubbling)
				.trigger('reset');
		});


		function preventEventBubbling(event) {
			event.stopPropagation();
		}
	});
}

function initInputParsers(parsers) {
	var parserAttributeName = 'data-parser';
	var $inputElements = $('[' + parserAttributeName + ']');

	$inputElements.each(function(index, inputElement) {
		var $inputElement = $(inputElement);

		var parserId = $inputElement.attr(parserAttributeName);
		if (!(parserId in parsers)) { throw new Error('Invalid parser specified: "' + parserId + '"'); }

		var parser = parsers[parserId];
		addParserListeners($inputElement, parser);
	});


	function addParserListeners($inputElement, parser) {
		$inputElement.on('input change', onInputUpdated);


		function onInputUpdated(event) {
			var inputValue = $inputElement.val();
			var parsedValue = parser(inputValue);
			if (parsedValue === inputValue) { return; }
			$inputElement.val(parsedValue);
			$inputElement.change();
		}
	}
}

function initInputValidators(validators) {
	var validatorAttributeName = 'data-validate';
	var $inputElements = $('[' + validatorAttributeName + ']');

	$inputElements.each(function(index, inputElement) {
		var $inputElement = $(inputElement);
		createValidator($inputElement, validatorAttributeName, validators);
	});


	function createValidator($inputElement, attributeName, validators) {
		var combinedValidatorExpression = $inputElement.attr(attributeName);
		var validate = getCompositeValidatorFunction(combinedValidatorExpression, validators);
		addParserListeners($inputElement, validate);


		function getCompositeValidatorFunction(combinedValidatorExpression, validators) {
			var validatorExpressions = combinedValidatorExpression ? combinedValidatorExpression.split(',') : null;
			var hasValidators = Boolean(validatorExpressions) && validatorExpressions.length > 0;
			if (!hasValidators) {
				return always;
			}

			var validatorFunctions = validatorExpressions.map(function(validatorExpression) {
				var validatorId = parseValidatorName(validatorExpression);
				var validatorArguments = parseValidatorArguments(validatorExpression);

				var validatorExists = hasValidator(validatorId, validators);
				if (!validatorExists) { throw new Error('Invalid validator expression: "' + combinedValidatorExpression + '"'); }

				return getValidator(validatorId, validatorArguments, validators);
			});

			var combinedValidator = function(value) {
				return validatorFunctions.every(function(validator) {
					return validator(value);
				});
			};

			return combinedValidator;


			function always(value) {
				return true;
			}

			function parseValidatorName(validatorExpression) {
				return /^\s*(.*?)(?:\s*\:\s*(.*?))?\s*$/.exec(validatorExpression)[1];
			}

			function parseValidatorArguments(validatorExpression) {
				var argumentsString = /^\s*(.*?)(?:\s*\:\s*(.*?))?\s*$/.exec(validatorExpression)[2];
				if (!argumentsString) { return null; }
				var validatorArguments = argumentsString.split(/\s*:\s*/);
				return validatorArguments.map(function(validatorArgument) {
					if (validatorArgument === 'null') {
						return null;
					} else if (validatorArgument === 'true') {
						return true;
					} else if (validatorArgument === 'false') {
						return false;
					} else if (/^-?[0-9]+(?:\.[0-9]+)?$/.test(validatorArgument)) {
						return Number(validatorArgument);
					} else if (/^'.*'$/.test(validatorArgument)) {
						return validatorArgument.substr(1, validatorArgument.length - 1 - 1);
					} else {
						throw new Error('Invalid validator argument:' + validatorArgument);
					}
				});
			}

			function hasValidator(validatorId, validators) {
				return (validatorId in validators);
			}

			function getValidator(validatorId, validatorArguments, validators) {
				var validator = validators[validatorId];
				if (!validatorArguments || (validatorArguments.length === 0)) { return validator; }
				var partiallyAppliedFunction = function(value) {
					return validator.apply(null, [value].concat(validatorArguments));
				};
				return partiallyAppliedFunction;
			}
		}

		function addParserListeners($inputElement, validator) {
			var validationTriggerAttributeName = 'data-validate-trigger';
			var triggerEvent = $inputElement.attr(validationTriggerAttributeName) || DEFAULT_VALIDATION_TRIGGERS;
			$inputElement.on(triggerEvent, onInputUpdated);
			$inputElement.on('reset', onInputReset);


			function onInputUpdated(event) {
				var inputValue = $inputElement.val();
				var isValid = validator(inputValue);
				$inputElement.parent().toggleClass('has-error', !isValid);
			}

			function onInputReset(event) {
				$inputElement.parent().removeClass('has-error');
			}
		}
	}
}

function initBindingSources() {
	var sourceAttributeName = 'data-bind-id';
	var $sourceElements = $('[' + sourceAttributeName + ']');

	var bindingSources = {};
	$sourceElements.each(function(index, sourceElement) {
		var $sourceElement = $(sourceElement);
		var sourceIdentifier = $sourceElement.attr(sourceAttributeName);
		bindingSources[sourceIdentifier] = createBindingSource($sourceElement, sourceIdentifier);
	});
	return bindingSources;


	function createBindingSource($sourceElement, sourceIdentifier) {
		var value = getCurrentValue($sourceElement);
		var bindingSource = {
			value: value,
			listeners: [],
			bind: function(handler) {
				this.listeners.push(handler);
			},
			unbind: function(handler) {
				if (!handler) {
					this.listeners.length = 0;
					return;
				}
				var index = this.listeners.indexOf(handler);
				if (index !== -1) { this.listeners.splice(index, 1); }
			},
			update: function(value) {
				var valueWasSpecified = (arguments.length > 0);
				if (valueWasSpecified) {
					if (this.value === value) { return; }
					this.value = value;
				}
				value = value || this.value;
				bindingSource.listeners.forEach(function(handler) {
					handler(value);
				});
			}
		};

		addBindingListeners($sourceElement, bindingSource);

		return bindingSource;


		function addBindingListeners($sourceElement, bindingSource) {
			if ($sourceElement.is('input')) {
				$sourceElement.on('input change', onBindingUpdated);
			} else if ($sourceElement.is('textarea,select,option,button')) {
				$sourceElement.on('change', onBindingUpdated);
			}


			function onBindingUpdated() {
				var value = getCurrentValue($sourceElement);
				bindingSource.update(value);
			}
		}

		function getCurrentValue($sourceElement) {
			if ($sourceElement.is('input[type="radio"],input[type="checkbox"]')) {
				return $sourceElement.prop('checked');
			} else if ($sourceElement.is('button,input[type="submit"],input[type="reset"],fieldset')) {
				return !$sourceElement.prop('disabled');
			} else if ($sourceElement.is('input,textarea,select,option')) {
				return $sourceElement.val();
			} else {
				return $sourceElement.text();
			}
		}
	}
}

function parseBindingExpression(bindingExpression, bindingSources, bindingFilters) {
	var bindingExpressionSegments = /^\s*(!?)\s*\s*(.*?)(?:\s*\|\s*(.*?))?\s*$/.exec(bindingExpression);
	var isBindingSourceInverted = Boolean(bindingExpressionSegments[1]);
	var bindingSourceId = bindingExpressionSegments[2];
	var bindingSource = bindingSources[bindingSourceId];
	if (!bindingSource) { throw new Error('Invalid binding expression: "' + bindingExpression + '"'); }

	var combinedFilterExpression = bindingExpressionSegments[3];
	var filter = getCompositeFilterFunction(combinedFilterExpression, bindingFilters);
	if (isBindingSourceInverted) { filter = invertBindingFilter(filter); }

	return {
		source: bindingSource,
		filter: filter
	};


	function getCompositeFilterFunction(combinedFilterExpression, bindingFilters) {
		var filterExpressions = combinedFilterExpression ? combinedFilterExpression.split('|') : null;
		var hasFilters = Boolean(filterExpressions) && filterExpressions.length > 0;
		if (!hasFilters) {
			return identity;
		}

		var filterFunctions = filterExpressions.map(function(filterExpression) {
			var filterId = parseFilterName(filterExpression);
			var filterArguments = parseFilterArguments(filterExpression);

			var filterExists = hasFilter(filterId, bindingFilters);
			if (!filterExists) { throw new Error('Invalid binding expression: "' + bindingExpression + '"'); }

			return getFilterFunction(filterId, filterArguments, bindingFilters);
		});

		var combinedFilter = filterFunctions.reduce(function(combinedFilter, filter) {
			return function(value) {
				return filter(combinedFilter(value));
			};
		});

		return combinedFilter;


		function identity(value) {
			return value;
		}

		function parseFilterName(filterExpression) {
			return /^\s*(.*?)(?:\s*\:\s*(.*?))?\s*$/.exec(filterExpression)[1];
		}

		function parseFilterArguments(filterExpression) {
			var argumentsString = /^\s*(.*?)(?:\s*\:\s*(.*?))?\s*$/.exec(filterExpression)[2];
			if (!argumentsString) { return null; }
			var filterArguments = argumentsString.split(/\s*:\s*/);
			return filterArguments.map(function(filterArgument) {
				if (filterArgument === 'null') {
					return null;
				} else if (filterArgument === 'true') {
					return true;
				} else if (filterArgument === 'false') {
					return false;
				} else if (/^-?[0-9]+(?:\.[0-9]+)?$/.test(filterArgument)) {
					return Number(filterArgument);
				} else if (/^'.*'$/.test(filterArgument)) {
					return filterArgument.substr(1, filterArgument.length - 1 - 1);
				} else {
					throw new Error('Invalid filter argument:' + filterArgument);
				}
			});
		}

		function hasFilter(filterId, filters) {
			return (filterId in filters);
		}

		function getFilterFunction(filterId, filterArguments, filters) {
			var filter = filters[filterId];
			if (!filterArguments || (filterArguments.length === 0)) { return filter; }
			var partiallyAppliedFunction = function(value) {
				return filter.apply(null, [value].concat(filterArguments));
			};
			return partiallyAppliedFunction;
		}
	}

	function invertBindingFilter(filter) {
		return function(value) {
			var invertedValue = !value;
			return filter(invertedValue);
		};
	}
}

function initBindingTargets(bindingSources, bindingFilters) {
	var targetAttributeName = 'data-bind-value';
	var $targetElements = $('[' + targetAttributeName + ']');

	$targetElements.each(function(index, targetElement) {
		var $targetElement = $(targetElement);
		var bindingExpression = $targetElement.attr(targetAttributeName);
		assignBindingTarget($targetElement, bindingExpression, bindingSources, bindingFilters);
	});


	function assignBindingTarget($targetElement, bindingExpression, bindingSources, bindingFilters) {
		var binding = parseBindingExpression(bindingExpression, bindingSources, bindingFilters);
		var bindingSource = binding.source;
		var bindingFilter = binding.filter;

		bindingSource.bind(function(value) {
			value = bindingFilter(value);
			updateBindingTarget($targetElement, value);
		});
	}

	function updateBindingTarget($targetElement, value) {
		if ($targetElement.is('input[type="radio"],input[type="checkbox"]')) {
			$targetElement.prop('checked', value && (value !== 'false'));
		} else if ($targetElement.is('button,input[type="submit"],input[type="reset"],fieldset')) {
			$targetElement.prop('disabled', !(value && (value !== 'false')));
		} else if ($targetElement.is('input,textarea,select,option')) {
			$targetElement.val(value);
			$targetElement.change();
		} else {
			$targetElement.text(value);
		}
	}
}

function updateBindings(bindingSources) {
	for (var bindingId in bindingSources) {
		var bindingSource = bindingSources[bindingId];
		bindingSource.update();
	}
}

function initFilecanvas(bindingSources, bindingFilters) {
	var filecanvas = window.filecanvas;

	initPurgeLinks(filecanvas);
	initFolderChecks(filecanvas, bindingSources, bindingFilters);


	function initPurgeLinks(filecanvas) {
		var attributeName = 'data-filecanvas-purge';

		var $purgeButtonElements = $('[' + attributeName + ']');

		createPurgeButtons($purgeButtonElements, attributeName, filecanvas);


		function createPurgeButtons($purgeButtonElements, attributeName, filecanvas) {
			$purgeButtonElements.on('click', onPurgeButtonClicked);


			function onPurgeButtonClicked(event) {
				var $purgeButtonElement = $(event.currentTarget);
				var siteAlias = $purgeButtonElement.attr(attributeName);
				$purgeButtonElement.prop('disabled', true);
				$purgeButtonElement.addClass('is-filecanvas-sync-loading');
				filecanvas.purgeSiteCache(siteAlias)
					.always(function() {
						$purgeButtonElement.prop('disabled', false);
						$purgeButtonElement.removeClass('is-filecanvas-sync-loading');
					})
					.done(function() {
						var successTimeoutDuration = 3000;
						setButtonState($purgeButtonElement, 'is-filecanvas-sync-success', successTimeoutDuration);
					})
					.fail(function(error) {
						var errorTimeoutDuration = 3000;
						setButtonState($purgeButtonElement, 'is-filecanvas-sync-error', errorTimeoutDuration);
						return;
					});
			}

			function setButtonState($element, className, timeoutDuration) {
				$element.prop('disabled', true);
				$element.addClass(className);
				setTimeout(function() {
					$element.prop('disabled', false);
					$element.removeClass(className);
				}, 3000);
			}
		}
	}

	function initFolderChecks(filecanvas, bindingSources, bindingFilters) {
		var targetAttributeName = 'data-bind-check-folder-exists';
		var targetAdapterAttributeName = 'data-bind-check-folder-exists-adapter';
		var $targetElements = $('[' + targetAttributeName + ']');

		$targetElements.each(function(index, targetElement) {
			var $targetElement = $(targetElement);
			var bindingExpression = $targetElement.attr(targetAttributeName);
			var adapterName = $targetElement.attr(targetAdapterAttributeName);
			assignBindingTarget($targetElement, bindingExpression, bindingSources, bindingFilters, adapterName);
		});


		function assignBindingTarget($targetElement, bindingExpression, bindingSources, bindingFilters, adapterName) {
			var binding = parseBindingExpression(bindingExpression, bindingSources, bindingFilters);
			var bindingSource = binding.source;
			var bindingFilter = binding.filter;
			var currentState = null;
			var currentRequest = null;
			var classPrefix = 'is-filecanvas-check-folder-exists-';

			bindingSource.bind(function(value) {
				value = bindingFilter(value);
				updateBindingTarget($targetElement, adapterName, value);
			});


			function updateBindingTarget($targetElement, adapterName, path) {
				setCurrentState($targetElement, 'loading');
				var debounceDuration = 500;
				var request = delay(debounceDuration)
					.then(function() {
						if (currentRequest !== request) { return; }
						return filecanvas.validateFolder(adapterName, path);
					})
					.done(function(isValid) {
						if (currentRequest !== request) { return; }
						setCurrentState($targetElement, isValid ? 'valid' : 'invalid');
					})
					.fail(function(error) {
						if (currentRequest !== request) { return; }
						setCurrentState($targetElement, 'error');
					});
				currentRequest = request;


				function delay(duration) {
					var deferred = new $.Deferred();
					setTimeout(function() { deferred.resolve(); }, duration);
					return deferred.promise();
				}
			}

			function setCurrentState($targetElement, state) {
				if (currentState) { $targetElement.removeClass(classPrefix + currentState); }
				currentState = state;
				$targetElement.addClass(classPrefix + currentState);
			}
		}
	}
}

function initSelectAllInputs() {
	$('[data-select-all-input]').on('click', function(event) {
		this.select();
	});
}

function initFixedAccordions() {
	(function($) {

		var TRANSITION_DURATION = ($.fn.collapse.Constructor && $.fn.collapse.Constructor.TRANSITION_DURATION || 350);

		$.fn.fixedAccordion = function() {
			return this.each(function() {
				var $element = $(this);
				var currentHeight = NaN;
				$(window).on('resize', onResized);
				onResized();


				function onResized() {
					var updatedHeight = $element.height();
					if (updatedHeight === currentHeight) { return; }
					currentHeight = updatedHeight;
					updateAccordionHeight($element, currentHeight);
				}

				function updateAccordionHeight($accordionElement, height) {
					var $panelElements = $accordionElement.children();
					var $headerElements = $panelElements.children('[role="tab"]');
					var $tabElements = $panelElements.children('[role="tabpanel"]');
					var $bodyElements = $tabElements.children();
					var headerHeights = $headerElements.map(
						function() { return $(this).outerHeight(); }
					).get();
					var headersHeight = headerHeights.reduce(function(totalHeight, headerHeight) {
						return totalHeight + headerHeight;
					}, 0);
					var minPanelHeight = 100;
					if (height > headersHeight + minPanelHeight) {
						$bodyElements.css('max-height', height - headersHeight);
					} else {
						var scrollOffsets = headerHeights.reduce(function(scrollOffsets, headerHeight, index) {
							var lastScrollOffset = scrollOffsets[index - 1] || 0;
							var lastHeaderHeight = headerHeights[index - 1] || 0;
							return scrollOffsets.concat(lastScrollOffset + lastHeaderHeight);
						}, []);
						$bodyElements.each(function(index, element) {
							var headerHeight = headerHeights[index];
							var nextHeaderHeight = headerHeights[index + 1] | 0;
							var margin = -(nextHeaderHeight / 2);
							$(element).css('max-height', height - headerHeight + margin);
						});
						$tabElements.each(function(index, element) {
							$(element).on('show.bs.collapse', function() {
								var scrollOffset = scrollOffsets[index];
								$accordionElement.animate({ 'scrollTop': scrollOffset }, TRANSITION_DURATION);
							});
						});
					}
				}
			});
		};

	})($);

	$('[data-fixed-accordion]').fixedAccordion();
}

function initAccordionAnchors() {
	var isExternalHashUpdate = false;
	var isInternalHashUpdate = false;

	var activeScrollAnimation = $('html, body');

	var TRANSITION_DURATION = ($.fn.collapse.Constructor && $.fn.collapse.Constructor.TRANSITION_DURATION || 350);

	$('.collapse[data-collapse-anchor]')
		.on('show.bs.collapse', function() {
			var $element = $(this);
			var scrollTargetSelector = $element.attr('data-collapse-anchor') || ('#' + this.id);
			var isScrollDisabled = this.hasAttribute('data-anchor-scroll-disabled');
			if (isScrollDisabled) {
				updateHashSilently(scrollTargetSelector);
				return;
			}
			var $scrollTargetElement = $(scrollTargetSelector);
			var $activePanelElement = $('.collapse.in[data-collapse-anchor],.collapsing[data-collapse-anchor]');
			var targetIsHidden = $(scrollTargetSelector).css('display') === 'none';
			if (targetIsHidden) {
				$scrollTargetElement[0].style.display = 'block';
			}
			var scrollTargetOffset = $scrollTargetElement.offset().top;
			if (targetIsHidden) {
				$scrollTargetElement[0].style.display = '';
			}
			var activeAnchorOffset = ($activePanelElement.length > 0 ? $activePanelElement.offset().top : null);
			var heightOffset = (activeAnchorOffset < scrollTargetOffset ? $activePanelElement.outerHeight() : 0);
			var targetScrollTop = scrollTargetOffset - heightOffset;
			if (isExternalHashUpdate) {
				setTimeout(function() {
					activeScrollAnimation.scrollTop(targetScrollTop);
				});
			} else {
				updateHashSilently(scrollTargetSelector);
				activeScrollAnimation = activeScrollAnimation.delay(isExternalHashUpdate ? TRANSITION_DURATION : 0).animate({
					scrollTop: targetScrollTop
				}, TRANSITION_DURATION);
			}
		})
		.on('hide.bs.collapse', function() {
			if (isExternalHashUpdate) { return; }
			var $element = $(this);
			var scrollTargetSelector = $element.attr('data-collapse-anchor') || ('#' + this.id);
			var isCurrentHash = (location.hash === scrollTargetSelector);
			if (isCurrentHash) {
				updateHashSilently(null);
			}
		});
	$(window).on('hashchange', onHashChanged);
	onHashChanged(null);


	function updateHashSilently(hash) {
		var scrollPosition = { x: window.scrollX, y: window.scrollY };
		isInternalHashUpdate = true;
		location.hash = hash || '';
		window.scrollTo(scrollPosition.x, scrollPosition.y);
		setTimeout(function() {
			isInternalHashUpdate = false;
		});
	}

	function onHashChanged(event) {
		if (location.hash) {
			var $panelElements = $('.collapse,.collapsing');
			var $panelElement = $panelElements.filter(location.hash + ',' + '[data-collapse-anchor="' + location.hash + '"]');
			if ($panelElement.length === 0) { return; }
			isExternalHashUpdate = true;
			var wasTransitionsEnabled = $.support.transition;
			$.support.transition = (isInternalHashUpdate ? wasTransitionsEnabled : false);
			$panelElements.not(location.hash).collapse('hide');
			$panelElement.collapse('show');
			$.support.transition = wasTransitionsEnabled;
			isExternalHashUpdate = false;
		}
	}
}

function initPathControls() {
	(function($) {

		$.fn.pathControl = function() {
			return this.each(function() {
				var $element = $(this);
				var $inputElement = $element.children('input');
				var $segmentsElement = $element.children('.path-control-segments');
				var rootLabel = $element.data('path-control-root') || null;

				var currentValue = null;
				updateAppearance($inputElement.val());

				$segmentsElement.on('click', function(event) {
					if ($inputElement.prop('disabled') || $inputElement.prop('readonly')) { return; }
					$element.addClass('editing');
					$inputElement.focus().val($inputElement.val());
				});
				$inputElement.on('input change', function(event) {
					var inputValue = $(this).val();
					updateAppearance(inputValue);
				});
				$inputElement.on('blur', function(event) {
					$element.removeClass('editing');
				});
				$inputElement.on('keydown', function(event) {
					var KEYCODE_ESCAPE = 27;
					if (event.keyCode === KEYCODE_ESCAPE) {
						$inputElement.blur();
					}
				});

				function updateAppearance(value) {
					if (value === currentValue) { return; }
					var pathSegments = value.split('/').filter(function(segment) {
						return Boolean(segment);
					});
					if (rootLabel) { pathSegments = [rootLabel].concat(pathSegments); }
					var html = pathSegments.map(function(segment) {
						return '<li>' + segment + '</li>';
					}).join('');
					$segmentsElement.html(html);
				}
			});
		};

	})($);

	$('.path-control').pathControl();
}

function initUploadControls() {
	(function($) {

		$.fn.uploadControl = function() {
			return this.each(function() {
				var $element = $(this);
				var $inputElement = $element.find('input[type="hidden"]');
				var $labelElement = $element.find('input[type="text"]');
				var $fileElement = $element.find('input[type="file"]');
				var $progressBarElement = $element.find('[role="progressbar"]');
				var $clearButtonElement = $element.find('[data-upload-clear]');
				var $dismissErrorButtonElement = $element.find('[data-upload-dismiss-error]');
				var uploadUrl = $element.attr('data-upload-url');
				var uploadMethod = $element.attr('data-upload-method') || 'POST';
				var requestUploadUrl = $element.attr('data-request-upload-url');
				var requestUploadMethod = $element.attr('data-request-upload-method') || 'POST';
				var shouldHideExtension = $element[0].hasAttribute('data-hide-extension');
				var isImage = $element[0].hasAttribute('data-image');
				var imageSettings = null;
				if (isImage) {
					imageSettings = {
						format: $element.attr('data-image-format'),
						quality: $element.attr('data-image-quality'),
						options: $element.attr('data-image-options') ? JSON.parse($element.attr('data-image-options')) : null
					};
				}
				var activeRequest = null;
				updateSelection($inputElement.val());

				$inputElement.on('change', function(event) {
					if (activeRequest) {
						activeRequest.abort();
						$element.removeClass('loading');
						setProgressBarValue({
							loaded: 0,
							tital: 0
						});
					}
					var fileUrl = event.currentTarget.value;
					updateSelection(fileUrl);
				});

				$clearButtonElement.on('click', function(event) {
					$inputElement.val('').trigger('change');
				});

				$dismissErrorButtonElement.on('click', function(event) {
					$element.removeClass('error');
				});

				$fileElement.on('change', function(event) {
					var fileInputElement = event.currentTarget;
					var selectedFile = fileInputElement.files[0];
					if (!selectedFile) { return; }
					$fileElement.val('');
					$element.addClass('loading');
					setProgressBarValue({
						loaded: 0,
						total: 0
					});
					processFile(selectedFile, {
						uploadUrl: uploadUrl,
						uploadMethod: uploadMethod,
						requestUploadUrl: requestUploadUrl,
						requestUploadMethod: requestUploadMethod,
						image: imageSettings
					})
						.progress(function(progress) {
							setProgressBarValue({
								loaded: progress.loaded,
								total: progress.total
							});
						})
						.then(function(uploadedUrl) {
							$inputElement.val(uploadedUrl).trigger('change');
						})
						.fail(function() {
							$element.addClass('error');
						})
						.always(function() {
							$element.removeClass('loading');
							setProgressBarValue({
								loaded: 0,
								total: 0
							});
						});
				});


				function updateSelection(url) {
					updateFileLabel($labelElement, url, {
						hideExtension: shouldHideExtension
					});
					updateClearButton($clearButtonElement, url);
					updateElementState($labelElement, url);


					function updateFileLabel($element, url, options) {
						options = options || {};
						var shouldHideExtension = options.hideExtension;
						if (!url) {
							$element.val('');
						} else {
							var filename = path.basename(url, (shouldHideExtension ? path.extname(url) : null));
							$element.val(filename);
						}
					}

					function updateClearButton($element, url) {
						var isDisabled = !url;
						$element.prop('disabled', isDisabled);
					}

					function updateElementState($element, url) {
						$element.toggleClass('has-value', Boolean(url));
					}
				}

				function abortable(promise) {
					var abortablePromise = promise
						.then(function(value) {
							activeRequest = null;
							return value;
						})
						.fail(function(error) {
							activeRequest = null;
						});
					abortablePromise.abort = function() {
						activeRequest = null;
						promise.abort();
					};
					activeRequest = abortablePromise;
					return abortablePromise;
				}

				function processFile(file, options) {
					options = options || {};
					var uploadUrl = options.uploadUrl;
					var uploadMethod = options.uploadMethod;
					var requestUploadUrl = options.requestUploadUrl;
					var requestUploadMethod = options.requestUploadMethod;
					var isImage = Boolean(options.image);
					var imageFormat = (isImage ? options.image.format : null);
					var imageQuality = (isImage ? options.image.quality : null);
					var imageOptions = (isImage ? options.image.options : null);

					if (isImage) {
						var deferred = new $.Deferred();
						var resizeImageProgressRatio = 0.1;
						var uploadProgressRatio = (1 - resizeImageProgressRatio);
						getResizedImageFile(file, {
							format: imageFormat,
							quality: imageQuality,
							options: imageOptions
						})
							.then(function(processedFile) {
								var percentageLoaded = 100 * resizeImageProgressRatio;
								deferred.notify({
									loaded: percentageLoaded,
									total: 100
								});
								processUpload(processedFile, {
									uploadUrl: uploadUrl,
									uploadMethod: uploadMethod,
									requestUploadUrl: requestUploadUrl,
									requestUploadMethod: requestUploadMethod
								})
									.progress(function(progress) {
										var percentageAlreadyLoaded = 100 * resizeImageProgressRatio;
										var percentageUploaded = 100 * uploadProgressRatio * (progress.loaded / progress.total);
										deferred.notify({
											loaded: percentageAlreadyLoaded + percentageUploaded,
											total: 100
										});
									})
									.then(function(value) {
										deferred.resolve(value);
									})
									.fail(function(error) {
										deferred.reject(error);
									});
							})
							.fail(function(error) {
								deferred.reject(error);
							});
						return deferred.promise();
					} else {
						return processUpload(file, {
							uploadUrl: uploadUrl,
							uploadMethod: uploadMethod,
							requestUploadUrl: requestUploadUrl,
							requestUploadMethod: requestUploadMethod
						});
					}
				}

				function getResizedImageFile(file, options) {
					options = options || {};
					var imageFormat = options.format || null;
					var imageQuality = options.quality || null;
					var imageOptions = options.options || null;
					return loadImage(file, {
						format: imageFormat,
						quality: imageQuality,
						options: imageOptions
					});
				}

				function processUpload(file, options) {
					options = options || {};
					var uploadUrl = options.uploadUrl;
					var uploadMethod = options.uploadMethod;
					var requestUploadUrl = options.requestUploadUrl;
					var requestUploadMethod = options.requestUploadMethod;
					var deferred = new $.Deferred();
					if (uploadUrl) {
						abortable(uploadFile(file, {
							url: uploadUrl,
							method: uploadMethod,
							headers: null
						}))
						.progress(function(progress) {
							deferred.notify({
								loaded: progress.bytesLoaded,
								total: progress.bytesTotal
							});
						})
						.then(function(response) {
							return uploadUrl;
						})
						.then(function(value) {
							deferred.resolve(value);
						})
						.fail(function(error) {
							deferred.reject(error);
						});
					} else {
						var retrieveUploadUrlProgressRatio = 0.25;
						var uploadProgressRatio = (1 - retrieveUploadUrlProgressRatio);
						abortable(retrieveUploadUrl(file, {
							url: requestUploadUrl,
							method: requestUploadMethod
						}))
							.progress(function(progress) {
								var percentageLoaded = 100 * (progress.bytesLoaded / progress.bytesTotal);
								deferred.notify({
									loaded: percentageLoaded * retrieveUploadUrlProgressRatio,
									total: 100
								});
							})
							.then(function(response) {
								var uploadOptions = response.upload;
								var uploadedUrl = response.location;
								return abortable(uploadFile(file, uploadOptions))
									.progress(function(progress) {
										var percentageAlreadyLoaded = 100 * retrieveUploadUrlProgressRatio;
										var percentageUploaded = 100 * uploadProgressRatio * (progress.bytesLoaded / progress.bytesTotal);
										deferred.notify({
											loaded: percentageAlreadyLoaded + percentageUploaded,
											total: 100
										});
									})
									.then(function(response) {
										return uploadedUrl;
									});
							})
							.then(function(value) {
								deferred.resolve(value);
							})
							.fail(function(error) {
								deferred.reject(error);
							});
					}
					return deferred.promise();
				}

				function retrieveUploadUrl(file, options) {
					options = options || {};
					var url = options.url + '/' + file.name;
					var method = options.method;
					return xhr.download({ url: url, method: method });
				}

				function uploadFile(file, options) {
					var method = options.method;
					var url = options.url;
					var headers = options.headers;
					return xhr.upload({
						method: method,
						url: url,
						headers: headers,
						body: file
					});
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
			});
		};

	})($);

	$('.upload-control').uploadControl();
}


function initNavigationDropdowns() {
	$('[data-navigation-dropdown]').on('change', function(event) {
		var $element = $(this);
		var url = getSelectedUrl($element);
		if (url) { document.location.href = url; }


		function getSelectedUrl($selectElement) {
			var selectedIndex = $selectElement.prop('selectedIndex');
			if (selectedIndex === -1) { return -1; }
			var optionElement = $selectElement.prop('options')[selectedIndex];
			var $selectedOption = $(optionElement);
			return $selectedOption.data('href') || null;
		}
	});
}

function initActionPanels() {
	(function($) {

		$.fn.panel = function(action) {
			return this.each(function() {
				var $element = $(this);
				var targetSelector = $element.data('target');
				var $contentElement = $(targetSelector);

				if (action === 'edit') {
					toggleEditPanel($element, $contentElement);
				} else if (action === 'delete') {
					toggleDeletePanel($element, $contentElement);
				} else {
					hidePanels($element, $contentElement);
				}
			});
		};


		function toggleEditPanel($element, $contentElement) {
			var hasClass = $element.hasClass('panel-edit');
			if (hasClass) {
				$contentElement.collapse('hide').on('hidden.bs.collapse', function () {
					$element.removeClass('panel-edit').attr('aria-expanded', false);
				});
			} else {
				$element.removeClass('panel-delete').addClass('panel-edit').attr('aria-expanded', true);
				$contentElement.collapse('show');
			}
		}

		function toggleDeletePanel($element, $contentElement) {
			var hasClass = $element.hasClass('panel-delete');
			if (hasClass) {
				$contentElement.collapse('hide').on('hidden.bs.collapse', function () {
					$element.removeClass('panel-delete').attr('aria-expanded', false);
				});
			} else {
				$element.removeClass('panel-edit').addClass('panel-delete').attr('aria-expanded', true);
				$contentElement.collapse('show');
			}
		}

		function hidePanels($element, $contentElement) {
			$element.removeClass('panel-edit panel-delete');
			$contentElement.collapse('hide');
		}

	})($);

	$('[data-toggle="panel"]').panel();
	$('[data-toggle="panel-action"]').click(function() {
		var $element = $(this);
		var targetSelector = $element.data('target');
		var action = $element.data('panel-action');
		var $targetElement = $(targetSelector);
		$targetElement.panel(action);
	});
}

function initOffscreenSidebar() {
	var offscreenToggleBtn = $('[data-toggle=offscreen]');
	var app = $('.app');
	var mainPanel = $('.main-panel');
	var offscreenDirection;
	var offscreenDirectionClass;
	var rapidClickCheck = false;
	var isOffscreenOpen = false;

	function toggleMenu() {
		if (isOffscreenOpen) {
			app.removeClass('offscreen move-left move-right');
		} else {
			app.addClass('offscreen ' + offscreenDirectionClass);
		}
		isOffscreenOpen = !isOffscreenOpen;
		rapidClickFix();
	}

	function rapidClickFix() {
		setTimeout(function() {
			rapidClickCheck = false;
		}, 300);
	}

	offscreenToggleBtn.on('click', function(e) {
		e.preventDefault();
		e.stopPropagation();
		offscreenDirection = $(this).data('move') ? $(this).data('move') : 'ltr';
		if (offscreenDirection === 'rtl') {
			offscreenDirectionClass = 'move-right';
		} else {
			offscreenDirectionClass = 'move-left';
		}
		if (rapidClickCheck) { return; }
		rapidClickCheck = true;
		toggleMenu();
	});

	mainPanel.on('click', function (e) {
		var target = e.target;

		if (isOffscreenOpen && target !== offscreenToggleBtn) {
			toggleMenu();
		}
	});
}

function initModalAutofocus() {
	$('.modal').on('show.bs.modal shown.bs.modal', function(event) {
		var $autofocusElement = $(this).find('[autofocus]');
		if ($autofocusElement.is('[data-validate]')) {
			resetValidation($autofocusElement);
		}
		$autofocusElement.focus();
	});


	function resetValidation($inputElement) {
		$inputElement
			.one('reset', preventEventBubbling)
			.trigger('reset');


		function preventEventBubbling(event) {
			event.stopPropagation();
		}
	}
}

function initModalForms() {
	var $activeModalElement = null;
	window.$.fn.modal.dismiss = function() {
		if ($activeModalElement) {
			$activeModalElement.modal('hide');
		}
	};

	$('form[target="modal"]').on('submit', function(event) {
		var $formElement = $(event.currentTarget);
		var targetIframeName = $formElement.attr('target');
		var $targetIframe = $('[name="' + targetIframeName + '"]');
		var $modalElement = $targetIframe.closest('.modal');
		var $submitElements = $formElement.find('input[type="submit"],button[type="submit"]');
		$modalElement.modal('show').on('hide.bs.modal', function() {
			$submitElements.prop('disabled', false);
		});
	});

	$('iframe[name="modal"]').load(function() {
		var iframeElement = this;
		setTimeout(function() {
			setTimeout(function() {
				try {
					var documentElement = iframeElement.contentWindow.document;
					var contentHeight = documentElement.documentElement.scrollHeight;
					iframeElement.style.height = contentHeight + 'px';
				} catch (error) {
					iframeElement.style.height = '';
					if (!(error instanceof DOMException)) { throw error; }
				}
			});
		});
	});
	$('iframe[name="modal"]').closest('.modal')
		.on('show.bs.modal', function(event) {
			$activeModalElement = $(this);
		})
		.on('hide.bs.modal', function(event) {
			$activeModalElement = null;
		});
}

function initModalAutoload() {
	$('.modal[data-show="true"]').modal();
}

function initLogout() {
	var $logoutIframe = $('[data-logout]');
	$logoutIframe.on('load', function() {
		document.location.href = '/login';
	});
}
