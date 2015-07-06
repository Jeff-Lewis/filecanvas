(function() {
	'use strict';

	$(function() {
		initSubmitButtons();
		initInputParsers();
		initDataBindings();
		initInputValidators();
		initShunt();
	});


	function initSubmitButtons() {
		var $formElements = $('form');

		$formElements.on('submit', function(event) {
			var $formElement = $(event.currentTarget);
			var $submitElements = $formElement.find('input[type="submit"],button[type="submit"]');
			$submitElements.prop('disabled', true);
		});
	}

	function initInputParsers() {
		var attributeName = 'data-parser';

		var $inputElements = $('[' + attributeName + ']');

		var parsers = {
			'slug': function(value) {
				return value.toLowerCase().replace(/['"‘’“”]/g, '').replace(/[^a-z0-9]+/g, '-');
			}
		};

		createInputParsers($inputElements, attributeName, parsers);


		function createInputParsers($inputElements, attributeName, parsers) {
			$inputElements.each(function(index, inputElement) {
				var $inputElement = $(inputElement);

				var parserId = $inputElement.attr(attributeName);
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
	}

	function initInputValidators() {
		var attributeName = 'data-validate';

		var $inputElements = $('[' + attributeName + ']');

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

		createInputValidators($inputElements, attributeName, validators);


		function createInputValidators($inputElements, attributeName, validators) {
			$inputElements.each(function(index, inputElement) {
				var $inputElement = $(inputElement);

				var validatorId = $inputElement.attr(attributeName);
				if (!(validatorId in validators)) { throw new Error('Invalid validator specified: "' + validatorId + '"'); }

				var validator = validators[validatorId];
				addParserListeners($inputElement, validator);
			});

			function addParserListeners($inputElement, validator) {
				$inputElement.on('input change blur', onInputUpdated);


				function onInputUpdated(event) {
					var inputValue = $inputElement.val();
					var isValid = validator(inputValue);
					$inputElement.parent().toggleClass('has-error', !isValid);
				}
			}
		}
	}

	function initDataBindings() {
		var sourceAttributeName = 'data-bind-id';
		var targetAttributeName = 'data-bind-value';

		var $sourceElements = $('[' + sourceAttributeName + ']');
		var $targetElements = $('[' + targetAttributeName + ']');

		var filters = {
			'slug': function(value) {
				return value.toLowerCase().replace(/['"‘’“”]/g, '').replace(/[^a-z0-9]+/g, '-');
			},
			'format': function(value, formatString, emptyString) {
				if (!value && (arguments.length >= 3)) { return emptyString; }
				return formatString.replace(/\$0/g, value);
			}
		};

		var dataBindings = createDataBindings($sourceElements, $targetElements, sourceAttributeName, targetAttributeName, filters);
		return dataBindings;


		function createDataBindings($sourceElements, $targetElements, sourceAttributeName, targetAttributeName, filters) {
			var bindings = createBindingSources($sourceElements, sourceAttributeName);
			assignBindingTargets(bindings, $targetElements, targetAttributeName, filters);
			updateAllBindings(bindings);

			return bindings;


			function createBindingSources($sourceElements, sourceAttributeName) {
				var bindingSources = {};
				$sourceElements.each(function(index, sourceElement) {
					var $sourceElement = $(sourceElement);
					var sourceIdentifier = $sourceElement.attr(sourceAttributeName);
					bindingSources[sourceIdentifier] = createDataBindingSource($sourceElement, sourceIdentifier);
				});
				return bindingSources;
			}

			function assignBindingTargets(bindingSources, $targetElements, targetAttributeName, filters) {
				$targetElements.each(function(index, targetElement) {
					var $targetElement = $(targetElement);

					var bindingExpression = $targetElement.attr(targetAttributeName);
					var bindingExpressionSegments = /^\s*(!?)\s*\s*(.*?)(?:\s*\|\s*(.*?))?\s*$/.exec(bindingExpression);

					var bindingSourceInverted = Boolean(bindingExpressionSegments[1]);
					var bindingSourceId = bindingExpressionSegments[2];
					var bindingSource = bindingSources[bindingSourceId];
					if (!bindingSource) { throw new Error('Invalid binding expression: "' + bindingExpression + '"'); }

					var bindingFilterExpression = bindingExpressionSegments[3] || null;

					var filter = getBindingFilter(bindingFilterExpression);
					if (bindingSourceInverted) { filter = invertBindingFilter(filter); }

					bindingSource.bind($targetElement, filter);


					function getBindingFilter(filterExpression) {
						if (!filterExpression) { return null; }

						var bindingFilterId = null;
						bindingFilterId = parseFilterId(bindingFilterExpression);

						var bindingFilterExists = (bindingFilterId in filters);
						if (!bindingFilterExists) { throw new Error('Invalid binding expression: "' + bindingExpression + '"'); }

						var bindingFilterArguments = parseFilterArguments(bindingFilterExpression);
						return getFilter(bindingFilterId, bindingFilterArguments, filters);


						function parseFilterId(filterExpression) {
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
								}
							});
						}

						function getFilter(filterId, filterArguments, filters) {
							var filter = filters[bindingFilterId];
							if (!filterArguments || (filterArguments.length === 0)) { return filter; }
							return function(value) {
								return filter.apply(null, [value].concat(filterArguments));
							};
						}
					}

					function invertBindingFilter(bindingFilter) {
						if (!bindingFilter) {
							return function(value) {
								return !value;
							};
						}

						return function(value) {
							var invertedValue = !value;
							return bindingFilter(invertedValue);
						};
					}
				});
			}

			function updateAllBindings(bindingSources) {
				for (var bindingId in bindingSources) {
					var bindingSource = bindingSources[bindingId];
					bindingSource.update();
				}
			}

			function createDataBindingSource($sourceElement, sourceIdentifier) {
				var value = getCurrentValue($sourceElement);
				var bindingSource = {
					value: value,
					observers: [],
					bind: bindTarget,
					unbind: unbindTarget,
					update: updateBindingValue
				};

				addBindingListeners($sourceElement, bindingSource);

				return bindingSource;


				function bindTarget($targetElement, filter) {
					var observers = bindingSource.observers;
					var observer = createObserver($targetElement, filter);
					observers.push(observer);
				}

				function unbindTarget($targetElement) {
					var observers = bindingSource.observers;

					if (!$targetElement) {
						observers.length = 0;
						return;
					}

					for (var i = 0; i < observers.length; i++) {
						var observer = observers[i];
						if (observer.element.is($targetElement)) {
							observers.splice(i--, 1);
						}
					}
				}

				function updateBindingValue(value) {
					var valueWasSpecified = (arguments.length > 0);
					if (valueWasSpecified) {
						if (bindingSource.value === value) { return; }
						bindingSource.value = value;
					}

					bindingSource.observers.forEach(function(observer) {
						var value = bindingSource.value;
						if (observer.filter) { value = observer.filter(value); }
						updateBindingTarget(observer.$element, value);
					});
				}

				function createObserver($targetElement, filter) {
					return {
						$element: $targetElement,
						filter: filter || null
					};
				}

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
		}
	}

	function initShunt() {
		var shunt = window.shunt;

		initPurgeLinks(shunt);


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
					$purgeButtonElement.addClass('-shunt-sync-loading');
					shunt.purgeSiteCache(siteAlias, onSiteCachePurged);


					function onSiteCachePurged(error) {
						$purgeButtonElement.prop('disabled', false);
						$purgeButtonElement.removeClass('-shunt-sync-loading');

						if (error) {
							var errorTimeoutDuration = 3000;
							setButtonState($purgeButtonElement, '-shunt-sync-error', errorTimeoutDuration);
							return;
						}

						var successTimeoutDuration = 3000;
						setButtonState($purgeButtonElement, '-shunt-sync-success', successTimeoutDuration);


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
			}
		}
	}
})();
