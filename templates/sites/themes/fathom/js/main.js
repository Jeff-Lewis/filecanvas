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
			'pdf',
			'txt'
		];
		$('.post a.project-wrp').click(function(event) {
			var $element = $(this);
			var downloadUrl = $element.attr('href');
			var extension = downloadUrl.split('.').pop();
			var canShowImagePreview = IMAGE_PREVIEW_EXTENSIONS.indexOf(extension) !== -1;
			if (canShowImagePreview) {
				event.preventDefault();
				$.fancybox.open(downloadUrl, {
					type: 'image',
					afterLoad: onLightboxOpened
				});
			}
			var canShowDocumentPreview = DOCUMENT_PREVIEW_EXTENSIONS.indexOf(extension) !== -1;
			if (canShowDocumentPreview) {
				event.preventDefault();
				$.fancybox.open(downloadUrl, {
					type: 'iframe',
					afterLoad: onLightboxOpened
				});
			}


			function onLightboxOpened() {
				$('.fancybox-inner').wrap('<a class="fancybox-download" href="' + downloadUrl + '" download onclick="$.fancybox.close()"></a>');
			}
		});
	}
});
