module.exports = (function() {
	'use strict';

	function AppService(db, appUser, appName) {
		this.db = db;
		this.appUser = appUser;
		this.appName = appName;
	}

	AppService.prototype.db = null;
	AppService.prototype.appUser = null;
	AppService.prototype.appName = null;

	AppService.prototype.getAuthenticationDetails = function(callback) {
		var query = { 'username': this.appUser, 'app': this.appName };
		var projection = { 'public': 1, 'users': 1 };

		this.db.collection('apps').findOne(query, projection,
			function(error, appModel) {
				if (error) { return callback && callback(error); }

				var authenticationDetails = {
					'public': appModel['public'],
					'users': appModel['users']
				};

				return callback && callback(null, authenticationDetails);
			}
		);
	};

	AppService.prototype.retrieveApp = function(includeCache, callback) {
		var query = { 'username': this.appUser, 'app': this.appName };
		var projection = { 'users': 0 };
		if (!includeCache) { projection['cache'] = 0; }

		this.db.collection('apps').findOne(query, projection,
			function(error, appModel) {
				if (error) { return callback && callback(error); }
				return callback && callback(null, appModel);
			}
		);
	};

	AppService.prototype.retrieveAppCache = function(callback) {
		var query = { 'username': this.appUser, 'app': this.appName };
		var projection = { 'cache': 1 };

		this.db.collection('apps').findOne(query, projection,
			function(error, appModel) {
				if (error) { return callback && callback(error); }
				return callback && callback(null, appModel.cache);
			}
		);
	};

	AppService.prototype.updateAppCache = function(cache, callback) {
		cache = cache || null;

		var query = { 'username': this.appUser, 'app': this.appName };
		var update = { $set: { 'cache': cache } };
		var options = { w: 1 };

		this.db.collection('apps').update(query, update, options,
			function(error, result) {
				if (error) { return callback && callback(error); }
				return callback && callback(null, result);
			}
		);
	};

	return AppService;
})();
