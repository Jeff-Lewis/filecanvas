module.exports = (function() {
	'use strict';

	function UserService() {

	}

	UserService.prototype.retrieveUser = function(username, callback) {
		var query = { 'username': username };

		this.db.collection('users').findOne(query,
			function(error, userModel) {
				if (error) { return callback && callback(error); }
				return callback && callback(null, userModel);
			}
		);
	};

	return UserService;
})();