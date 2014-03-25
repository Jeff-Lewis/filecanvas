module.exports = (function() {
	'use strict';

	var DB_COLLECTION_USERS = 'users';
	var DB_COLLECTION_DROPBOX_USERS = 'dropboxUsers';

	var USER_FOLDER_PATH_FORMAT = '/.dropkick/sites/${USERNAME}';
	var USER_FOLDER_SHARE_PATH_FORMAT = '/.dropkick/sites/${USERNAME}/${SHARENAME}';


	function UserService(dataService) {
		this.dataService = dataService;
	}

	UserService.prototype.dataService = null;

	UserService.prototype.getUserFolderPath = function(username, shareName) {
		if (!shareName) {
			return USER_FOLDER_PATH_FORMAT.replace(/\$\{USERNAME\}/, username).replace(/\$\{SHARENAME\}/, shareName);
		}
		return USER_FOLDER_SHARE_PATH_FORMAT.replace(/\$\{USERNAME\}/, username).replace(/\$\{SHARENAME\}/, shareName);
	};

	UserService.prototype.retrieveUser = function(username, callback) {
		var query = { 'username': username };

		this.dataService.db.collection(DB_COLLECTION_USERS).findOne(query,
			function(error, userModel) {
				if (error) { return callback && callback(error); }
				if (!userModel) {
					error = new Error();
					error.status = 404;
					return callback && callback(error);
				}
				return callback && callback(null, userModel);
			}
		);
	};

	UserService.prototype.retrieveDefaultSiteName = function(username, callback) {
		var query = { 'username': username };
		var projection = { 'default': 1 };

		this.dataService.db.collection(DB_COLLECTION_USERS).findOne(query, projection,
			function(error, userModel) {
				if (error) { return callback && callback(error); }
				if (!userModel) {
					error = new Error();
					error.status = 404;
					return callback && callback(error);
				}
				return callback && callback(null, userModel['default']);
			}
		);
	};

	UserService.prototype.retrieveDropboxAccountUsername = function(dropboxEmail, callback) {
		var query = { 'email': dropboxEmail };
		var projection = { 'username': 1 };

		this.dataService.db.collection(DB_COLLECTION_DROPBOX_USERS).findOne(query, projection,
			function(error, dropboxUserModel) {
				if (error) { return callback && callback(error); }
				if (!dropboxUserModel) {
					error = new Error();
					error.status = 404;
					return callback && callback(error);
				}
				return callback && callback(null, dropboxUserModel.username);
			}
		);
	};

	return UserService;
})();
