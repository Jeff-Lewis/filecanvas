/* jshint jquery: true */
(function() {
	'use strict';

	$(function() {
		_initDataBindings();
	});

	function _initDataBindings() {
		var sourceAttributeName = 'data-bind-id';
		var targetAttributeName = 'data-bind-value';

		var $sourceElements = $('[' + sourceAttributeName + ']');
		var $targetElements = $('[' + targetAttributeName + ']');

		var filters = {
			'slug': function(value) {
				return value.toLowerCase().replace(/[^a-z0-9]+(?!$)/g, '-').replace(/[^a-z0-9]+$/, '');
			},
			'format': function(value, formatString) {
				return formatString.replace(/\$0/g, value);
			}
		};

		var dataBindings = _createDataBindings($sourceElements, $targetElements, sourceAttributeName, targetAttributeName, filters);
		return dataBindings;


		function _createDataBindings($sourceElements, $targetElements, sourceAttributeName, targetAttributeName, filters) {
			var bindings = _createBindingSources($sourceElements, sourceAttributeName);
			_assignBindingTargets(bindings, $targetElements, targetAttributeName, filters);
			_updateAllBindings(bindings);

			return bindings;
			

			function _createBindingSources($sourceElements, sourceAttributeName) {
				var bindingSources = {};
				$sourceElements.each(function(index, sourceElement) {
					var $sourceElement = $(sourceElement);
					var sourceIdentifier = $sourceElement.attr(sourceAttributeName);
					bindingSources[sourceIdentifier] = _createDataBindingSource($sourceElement, sourceIdentifier);
				});
				return bindingSources;
			}

			function _assignBindingTargets(bindingSources, $targetElements, targetAttributeName, filters) {
				$targetElements.each(function(index, targetElement) {
					var $targetElement = $(targetElement);
					
					var bindingExpression = $targetElement.attr(targetAttributeName);
					var bindingExpressionSegments = /^\s*(.*?)(?:\s*\|\s*(.*?))?\s*$/.exec(bindingExpression);
					
					var bindingSourceId = bindingExpressionSegments[1];
					var bindingSource = bindingSources[bindingSourceId];
					if (!bindingSource) { throw new Error('Invalid binding expression: "' + bindingExpression + '"'); }

					var bindingFilterExpression = bindingExpressionSegments[2] || null;
					var bindingFilter = null;

					if (bindingFilterExpression) {
						var bindingFilterId = null;
						var bindingFilterArguments = null;
						bindingFilterId = _parseFilterId(bindingFilterExpression);
						
						var bindingFilterExists = (bindingFilterId in filters);
						if (!bindingFilterExists) { throw new Error('Invalid binding expression: "' + bindingExpression + '"'); }
						
						bindingFilterArguments = _parseFilterArguments(bindingFilterExpression);
						bindingFilter = _getFilter(bindingFilterId, bindingFilterArguments, filters);
					}
					
					bindingSource.bind($targetElement, bindingFilter);


					function _parseFilterId(filterExpression) {
						return /^\s*(.*?)(?:\s*\:\s*(.*?))?\s*$/.exec(filterExpression)[1];
					}

					function _parseFilterArguments(filterExpression) {
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

					function _getFilter(filterId, filterArguments, filters) {
						var filter = filters[bindingFilterId];
						if (!filterArguments || (filterArguments.length === 0)) { return filter; }
						return function(value) {
							return filter.apply(null, [value].concat(filterArguments));
						};
					}
				});
			}

			function _updateAllBindings(bindingSources) {
				for (var bindingId in bindingSources) {
					var bindingSource = bindingSources[bindingId];
					bindingSource.update();
				}
			}


			function _createDataBindingSource($sourceElement, sourceIdentifier) {
				var value = _getCurrentValue($sourceElement);
				var bindingSource = {
					value: value,
					observers: [],
					bind: _bind,
					unbind: _unbind,
					update: _update
				};
				
				_addBindingListeners($sourceElement, bindingSource);

				return bindingSource;


				function _bind($targetElement, filter) {
					var observers = bindingSource.observers;
					var observer = _createObserver($targetElement, filter);
					observers.push(observer);
				}

				function _unbind($targetElement) {
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

				function _update(value) {
					var valueWasSpecified = (arguments.length > 0);
					if (valueWasSpecified) {
						if (bindingSource.value === value) { return; }
						bindingSource.value = value;
					}

					bindingSource.observers.forEach(function(observer) {
						var value = bindingSource.value;
						if (observer.filter) { value = observer.filter(value); }
						_updateBindingTarget(observer.$element, value);
					});
				}

				function _createObserver($targetElement, filter) {
					return {
						$element: $targetElement,
						filter: filter || null
					};
				}

				function _addBindingListeners($sourceElement, bindingSource) {
					if ($sourceElement.is('input')) {
						$sourceElement.on('input change', _handleBindingUpdated);
					} else if ($sourceElement.is('textarea,select,option,button')) {
						$sourceElement.on('change', _handleBindingUpdated);
					}
					
					function _handleBindingUpdated() {
						var value = _getCurrentValue($sourceElement);
						bindingSource.update(value);
					}
				}

				function _getCurrentValue($sourceElement) {
					if ($sourceElement.is('input,textarea,select,option,button')) {
						return $sourceElement.val();
					} else {
						return $sourceElement.text();
					}
				}

				function _updateBindingTarget($targetElement, value) {
					if ($targetElement.is('input,textarea,select,option,button')) {
						$targetElement.val(value);
						$targetElement.change();
					} else {
						$targetElement.text(value);
					}
				}
			}
		}

	}
})();