module.exports = (function() {
	'use strict';

	return function(req, res, next) {
		if ((req.url !== '/') && (req.url.substr(-1) === '/')) {
			req.url = req.url.slice(0, -1);
		}
		next();
	};
})();