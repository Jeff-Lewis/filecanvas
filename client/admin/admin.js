'use strict';

$(function() {

	var bindingFilters = {
		'slug': function(value) {
			return value.toLowerCase().replace(/['"‘’“”]/g, '').replace(/[^a-z0-9]+/g, '-');
		},
		'format': function(value, formatString, emptyString) {
			if (!value && (arguments.length >= 3)) { return emptyString; }
			return formatString.replace(/\$0/g, value);
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
		'email': function(value) {
			return /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,4}$/.test(value);
		},
		'domain': function(value) {
			return /^(?!:\/\/)([a-z0-9]+\.)?[a-z0-9][a-z0-9-]+\.[a-z]{2,6}?$/.test(value);
		},
		'slug': function(value) {
			return /^[a-z0-9\-]+$/.test(value);
		}
	};

	initFormSubmitButtons();
	initFormResetButtons();
	initInputParsers(parsers);
	var bindingSources = initBindingSources();
	initBindingTargets(bindingSources, bindingFilters);
	initShunt(bindingSources, bindingFilters);
	updateBindings(bindingSources);
	initInputValidators(validators);
	initSelectAllInputs();
	initAccordionAnchors();
	initActionPanels();
	initOffscreenSidebar();
	initLogout();
});


function initFormSubmitButtons() {
	var $formElements = $('form');

	$formElements.on('submit', function(event) {
		var $formElement = $(event.currentTarget);
		var $submitElements = $formElement.find('input[type="submit"],button');
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
		var validatorId = $inputElement.attr(attributeName);
		if (!(validatorId in validators)) { throw new Error('Invalid validator specified: "' + validatorId + '"'); }

		var validator = validators[validatorId];
		addParserListeners($inputElement, validator);


		function addParserListeners($inputElement, validator) {
			$inputElement.on('input change blur', onInputUpdated);
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
			} else if ($sourceElement.is('button,input[type="submit"],input[type="reset"]')) {
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

	var filterExpressions = bindingExpressionSegments[3] ? bindingExpressionSegments[3].split('|') : null;
	var hasFilters = Boolean(filterExpressions) && (filterExpressions.length > 0);

	var filter = function(value) { return value; };
	if (hasFilters) { filter = getFilteredBindingFunction(filter, bindingFilters); }
	if (isBindingSourceInverted) { filter = invertBindingFilter(filter); }

	return {
		source: bindingSource,
		filter: filter
	};


	function getFilteredBindingFunction(bindingFunction, bindingFilters) {
		var filterFunctions = filterExpressions.map(function(filterName) {
			var filterId = parseFilterName(filterName);
			var filterArguments = parseFilterArguments(filterName);

			var filterExists = (filterId in bindingFilters);
			if (!filterExists) { throw new Error('Invalid binding expression: "' + bindingExpression + '"'); }

			return getFilter(filterId, filterArguments, bindingFilters);
		});

		var combinedFilter = filterFunctions.reduce(function(combinedFilter, filter) {
			return function(value) {
				return filter(combinedFilter(value));
			};
		}, bindingFunction);

		return combinedFilter;


		function parseFilterName(filterName) {
			return /^\s*(.*?)(?:\s*\:\s*(.*?))?\s*$/.exec(filterName)[1];
		}

		function parseFilterArguments(filterName) {
			var argumentsString = /^\s*(.*?)(?:\s*\:\s*(.*?))?\s*$/.exec(filterName)[2];
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

		function getFilter(filterId, filterArguments, filters) {
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
		} else if ($targetElement.is('button,input[type="submit"],input[type="reset"]')) {
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

function initShunt(bindingSources, bindingFilters) {
	var shunt = window.shunt;

	initPurgeLinks(shunt);
	initFolderChecks(shunt, bindingSources, bindingFilters);


	function initPurgeLinks(shunt) {
		var attributeName = 'data-shunt-purge';

		var $purgeButtonElements = $('[' + attributeName + ']');

		createPurgeButtons($purgeButtonElements, attributeName, shunt);


		function createPurgeButtons($purgeButtonElements, attributeName, shunt) {
			$purgeButtonElements.on('click', onPurgeButtonClicked);


			function onPurgeButtonClicked(event) {
				var $purgeButtonElement = $(event.currentTarget);
				var siteAlias = $purgeButtonElement.attr(attributeName);
				$purgeButtonElement.prop('disabled', true);
				$purgeButtonElement.addClass('is-shunt-sync-loading');
				shunt.purgeSiteCache(siteAlias)
					.always(function() {
						$purgeButtonElement.prop('disabled', false);
						$purgeButtonElement.removeClass('is-shunt-sync-loading');
					})
					.done(function() {
						var successTimeoutDuration = 3000;
						setButtonState($purgeButtonElement, 'is-shunt-sync-success', successTimeoutDuration);
					})
					.fail(function(error) {
						var errorTimeoutDuration = 3000;
						setButtonState($purgeButtonElement, 'is-shunt-sync-error', errorTimeoutDuration);
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

	function initFolderChecks(shunt, bindingSources, bindingFilters) {
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
			var classPrefix = 'is-shunt-check-folder-exists-';

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
						return shunt.validateFolder(adapterName, path);
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

function initAccordionAnchors() {
	$('.collapse').on('show.bs.collapse', function() {
		location.hash = '#' + this.id;
	});
	$('.collapse').on('hidden.bs.collapse', function() {
		var isCurrentHash = location.hash === '#' + this.id;
		if (isCurrentHash) {
			var scrollPosition = { x: window.scrollX, y: window.scrollY };
			location.hash = '';
			window.scrollTo(scrollPosition.x, scrollPosition.y);
		}
	});
	$(window).on('hashchange', onHashChanged);
	onHashChanged(null);


	function onHashChanged(event) {
		if (location.hash) {
			var $panelElements = $('.collapse,.collapsing');
			var $panelElement = $panelElements.filter(location.hash);
			if ($panelElement.length === 0) { return; }
			$panelElements.not(location.hash).collapse('hide');
			$panelElement.collapse('show');
		}
	}
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

function initLogout() {
	var $logoutIframe = $('[data-logout]');
	$logoutIframe.on('load', function() {
		document.location.href = '/login';
	});
}
