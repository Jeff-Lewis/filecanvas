'use strict';

// Sticky nav

$(window).load(function(){
  $('#mainnav').sticky({ topSpacing: 0 });
});


// One Page Navigation

$('#fluid-nav').onePageNav({
	currentClass: 'current',
	changeHash: false,
	scrollSpeed: 750,
	scrollOffset: 30,
	scrollThreshold: 0.5,
	filter: ':not(.external)',
	easing: 'swing'
});


// Smooth scroll

$(document).ready(function() {
	$(document).on('click', '.scroll-link:not(.external)', function(event) {
		event.preventDefault();
		var $element = $(this);
		var targetSelector = $element.attr('href');
		var $targetElement = $(targetSelector);
		$('html, body').animate({
			scrollTop: $targetElement.offset().top + 'px'
		}, {
			duration: 500,
			easing: 'swing'
		});
	});

});


// Selectnav

selectnav('fluid-nav', {
	nested: false,
	label: false
});


// Filtering

$(function(){
	$(document).on('click', '.page .option-set a', function(event) {
		event.preventDefault();

		var $element = $(this);
		var $optionSet = $element.closest('.option-set');
		var $group = $element.closest('.page');

		var isAlreadySelected = $element.hasClass('selected');
		if (isAlreadySelected) { return false; }

		$optionSet.find('.selected').removeClass('selected');
		$element.addClass('selected');

		var filterSelector = $element.attr('data-option-value');
		$group.find('.post').each(function(index, element) {
			var $element = $(element);
			$element.toggleClass('hidden', !$element.is(filterSelector));
		});

		return false;
	});
});


// Footer spacing

$(document).ready(function() {
	var footerHeight = 0;
	updateFooterHeight();
	$(window).on('resize', function() {
		updateFooterHeight();
	});


	function updateFooterHeight() {
		var updatedFooterHeight = $('footer').outerHeight();
		if (updatedFooterHeight === footerHeight) { return; }
		footerHeight = updatedFooterHeight;
		$('.pages').css('paddingBottom', footerHeight);
	}
});

// Admin upload hotspots

$(document).ready(function() {
	if (window.shunt) {
		disableContextMenu();
		initUploadHotspots('[data-admin-upload]', function(files) {
			window.shunt.uploadFiles(files);
		});
	}

	function disableContextMenu() {
		$(document).on('contextmenu', function(event) {
			event.preventDefault();
		});
	}

	function initUploadHotspots(selector, callback) {
		$(document)
			.on('dragenter dragover', '[data-admin-upload]', function(event) {
				var $element = $(this);
				var dataTransfer = event.originalEvent.dataTransfer;
				var mimeTypes = Array.prototype.slice.call(dataTransfer.types);
				var isFileDrag = (mimeTypes.indexOf('Files') !== -1);
				if (!isFileDrag) { return; }
				if (event.type === 'dragenter') {
					showDragFeedback($element);
				}
				acceptDropOperation(event.originalEvent, 'copy');
			})
			.on('dragleave', '[data-admin-upload]', function(event) {
				var $element = $(this);
				var targetElement = event.target;
				var containsTargetElement = targetElement && $.contains(this, targetElement);
				if (containsTargetElement) { return; }
				hideDragFeedback($element);
			})
			.on('drop', '[data-admin-upload]', function(event) {
				var $element = $(this);
				event.preventDefault();
				hideDragFeedback($element);
				var dataTransfer = event.originalEvent.dataTransfer;
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
			});
	}

	function acceptDropOperation(event, dropEffect) {
		event.dataTransfer.dropEffect = dropEffect;
		event.preventDefault();
	}

	function showDragFeedback($element) {
		$element.addClass('dragging');
	}

	function hideDragFeedback($element) {
		$element.removeClass('dragging');
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
});
