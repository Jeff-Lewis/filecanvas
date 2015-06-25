'use strict';

module.exports = function(options) {
	var debugMode = Boolean(options.debug);

	return function(err, req, res, next) {
		var templateOptions = getErrorTemplateOptions(err, debugMode);
		res.render('error/error', templateOptions);


		function getErrorTemplateOptions(error) {
			return {
				error: error
			};
		}
	};
};
