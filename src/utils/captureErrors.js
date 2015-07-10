'use strict';

module.exports = function() {
	captureFullStackTraces({ limit: 256 });
	hideNodeCoreStackTraces();
	hideExternalModuleStackTraces();


	function captureFullStackTraces(options) {
		options = options || {};
		var limit = options.limit || Infinity;

		require('trace');
		Error.stackTraceLimit = limit;
	}

	function hideNodeCoreStackTraces() {
		require('clarify');
	}

	function hideExternalModuleStackTraces() {
		require('clarify/node_modules/stack-chain').filter.attach(function(error, frames) {
			return frames.filter(function(callSite) {
				var name = callSite && callSite.getFileName();
				var isLocalFile = name && (name.indexOf('node_modules') === -1);
				return isLocalFile;
			});
		});
	}
};
