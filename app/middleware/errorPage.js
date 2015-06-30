'use strict';

module.exports = function(options) {
	var templateName = options.template;

	return function(err, req, res, next) {
		var templateOptions = getErrorTemplateOptions(err);
		res.status(err.status || 500);
		res.render(templateName, templateOptions);


		function getErrorTemplateOptions(error) {
			return {
				error: error
			};
		}
	};
};
