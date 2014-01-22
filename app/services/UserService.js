module.exports = (function() {
	'use strict';

	function UserService(db) {
		this.db = db;
	}

	UserService.prototype.db = null;

	UserService.prototype.retrieveUser = function(username, callback) {
		var query = { 'username': username };

		this.db.collection('users').findOne(query,
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

		this.db.collection('users').findOne(query, projection,
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

	return UserService;
})();
