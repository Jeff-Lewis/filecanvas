'use strict';

$(document).ready(function(){
	initFilePreview();


	function initFilePreview() {
		var IMAGE_PREVIEW_EXTENSIONS = [
			'jpg',
			'jpeg',
			'gif',
			'png'
		];
		var DOCUMENT_PREVIEW_EXTENSIONS = [
			'html',
			'txt'
		];
		$(document).on('click', '.post a.project-wrp', function(event) {
			var $element = $(event.currentTarget);
			var downloadUrl = $element.attr('href');
			var extension = downloadUrl.split('.').pop();
			var canShowImagePreview = IMAGE_PREVIEW_EXTENSIONS.indexOf(extension) !== -1;
			if (canShowImagePreview) {
				event.preventDefault();
				showImagePreview(downloadUrl);
			}
			var canShowDocumentPreview = DOCUMENT_PREVIEW_EXTENSIONS.indexOf(extension) !== -1;
			if (canShowDocumentPreview) {
				event.preventDefault();
				showDocumentPreview(downloadUrl);
			}
		});

		function showImagePreview(url) {
			showPreview(url, { type: 'image' });
		}

		function showDocumentPreview(url) {
			showPreview(url, { type: 'iframe' });
		}

		function showPreview(url, options) {
			var type = options.type;
			$.fancybox.open(url, {
				type: type,
				afterLoad: function() {
					$('.fancybox-inner').wrap('<a class="fancybox-download" href="' + url + '" download onclick="$.fancybox.close()"></a>');
				}
			});
		}
	}

});
