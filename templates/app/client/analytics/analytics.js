'use strict';

var StackFrame = require('stackframe');
var StackTrace = require('stacktrace-js');

require('./lib/analytics');

var SegmentAnalyticsAdapter = require('./lib/adapters/SegmentAnalyticsAdapter');
var ConsoleAnalyticsAdapter = require('./lib/adapters/ConsoleAnalyticsAdapter');

$(function() {

	var adapter = (window.analytics ? new SegmentAnalyticsAdapter() : new ConsoleAnalyticsAdapter());

	$.fn.analytics.track = function(event, trackingId, trackingData, callback) {
		adapter.track(trackingId, trackingData, callback);
	};

	handleUncaughtExceptions(function(error, stackFrames) {
		var errorFrame = stackFrames[0];
		var trackingId = 'error:client';
		var trackingData = {
			message: error.toString(),
			source: errorFrame.fileName,
			line: errorFrame.lineNumber,
			column: errorFrame.columnNumber,
			stack: stackFrames.join('\n')
		};
		adapter.track(trackingId, trackingData);
	});


	function handleUncaughtExceptions(callback) {
		window.onerror = function(message, source, line, column, error) {
			if (error) {
				StackTrace.fromError(error).then(function(stackFrames) { callback(error, stackFrames); }).catch(logError);
			} else {
				try {
					error = new Error(message);
					var stackFrames = [
						new StackFrame({ fileName: source, lineNumber: line, columnNumber: column })
					];
					callback(error, stackFrames);
				} catch (err) {
					logError(err);
				}
			}

			function logError(error) {
				if (!window.console) { return; }
				if (window.console.error) {
					window.console.error(error);
				} else {
					window.console.log(error);
				}
			}
		};
	}
});
