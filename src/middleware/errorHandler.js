'use strict';

module.exports = function() {
	var isProduction = process.env.NODE_ENV === 'production';

	return function(err, req, res, next) {
		var url = req.method + ' ' + req.protocol + '://' + req.get('host') + req.originalUrl;
		var status = err.status || 500;
		var shouldHideErrorMessage = (status === 500) && isProduction;
		var errorHeader = {
			message: (shouldHideErrorMessage ? null : err.message)
		};
		if (!isProduction) {
			errorHeader.url = url;
			errorHeader.debug = err.stack;
		}
		res.status(status);
		res.set('X-Error', JSON.stringify(errorHeader));
		res.send(status);
	};
};
