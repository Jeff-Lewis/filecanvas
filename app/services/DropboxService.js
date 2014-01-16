module.exports = (function() {
	'use strict';

	var Dropbox = require('dropbox');


	function DropboxService() {
	}

	DropboxService.prototype.client = null;
	DropboxService.prototype.connecting = false;

	DropboxService.prototype.generateAppToken = function(config, callback) {
		var client = new Dropbox.Client({
			key: config.appKey,
			secret: config.appSecret,
			sandbox: false
		});

		client.authDriver(new Dropbox.AuthDriver.NodeServer(8191));

		client.authenticate(function(error, client) {
			if (error) { return callback(error); }
			if (callback) { callback(null, client._oauth._token); }
		});
	};

	DropboxService.prototype.connect = function(config, callback) {
		if (this.connecting) { throw new Error('Connection attempt already in progress'); }
		if (this.client) { throw new Error('Already connected'); }

		this.connecting = true;

		var client = new Dropbox.Client({
			key: config.appKey,
			secret: config.appSecret,
			token: config.appToken,
			sandbox: false
		});

		var self = this;

		client.onError.addListener(function(error) {
			console.warn('Dropbox API error: ' + self.getErrorType(error));
		});

		client.authenticate(function(error, client) {
			self.connecting = false;
			if (error) { return callback(error); }
			self.client = client;
			if (callback) { callback(null, client); }
		});
	};

	DropboxService.prototype.getErrorType = function(error) {
		switch (error.status) {
		case Dropbox.ApiError.INVALID_TOKEN:
			// If you're using dropbox.js, the only cause behind this error is that
			// the user token expired.
			// Get the user through the authentication flow again.
			return 'Dropbox.ApiError.INVALID_TOKEN';

		case Dropbox.ApiError.NOT_FOUND:
			// The file or folder you tried to access is not in the user's Dropbox.
			// Handling this error is specific to your application.
			return 'Dropbox.ApiError.INVALID_TOKEN';

		case Dropbox.ApiError.OVER_QUOTA:
			// The user is over their Dropbox quota.
			// Tell them their Dropbox is full. Refreshing the page won't help.
			return 'Dropbox.ApiError.INVALID_TOKEN';

		case Dropbox.ApiError.RATE_LIMITED:
			// Too many API requests. Tell the user to try again later.
			// Long-term, optimize your code to use fewer API calls.
			return 'Dropbox.ApiError.INVALID_TOKEN';

		case Dropbox.ApiError.NETWORK_ERROR:
			// An error occurred at the XMLHttpRequest layer.
			// Most likely, the user's network connection is down.
			// API calls will not succeed until the user gets back online.
			return 'Dropbox.ApiError.INVALID_TOKEN';

		case Dropbox.ApiError.INVALID_PARAM:
			return 'Dropbox.ApiError.INVALID_PARAM';
		case Dropbox.ApiError.OAUTH_ERROR:
			return 'Dropbox.ApiError.OAUTH_ERROR';
		case Dropbox.ApiError.INVALID_METHOD:
			return 'Dropbox.ApiError.INVALID_METHOD';
		default:
			// Caused by a bug in dropbox.js, in your application, or in Dropbox.
			// Tell the user an error occurred, ask them to refresh the page.
		}
	};

	return new DropboxService();

})();
