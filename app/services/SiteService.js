module.exports = (function() {
	'use strict';

	function SiteService(db, siteUser, siteName) {
		this.db = db;
		this.siteUser = siteUser;
		this.siteName = siteName;
	}

	SiteService.prototype.db = null;
	SiteService.prototype.siteUser = null;
	SiteService.prototype.siteName = null;

	SiteService.prototype.getAuthenticationDetails = function(callback) {
		var query = { 'username': this.siteUser, 'site': this.siteName };
		var projection = { 'public': 1, 'users': 1 };

		this.db.collection('sites').findOne(query, projection,
			function(error, siteModel) {
				if (error) { return callback && callback(error); }
				if (!siteModel) {
					error = new Error();
					error.status = 404;
					return callback && callback(error);
				}

				var authenticationDetails = {
					'public': siteModel['public'],
					'users': siteModel['users']
				};

				return callback && callback(null, authenticationDetails);
			}
		);
	};

	SiteService.prototype.retrieveSite = function(includeCache, callback) {
		var query = { 'username': this.siteUser, 'site': this.siteName };
		var projection = { 'users': 0 };
		if (!includeCache) { projection['cache'] = 0; }

		this.db.collection('sites').findOne(query, projection,
			function(error, siteModel) {
				if (error) { return callback && callback(error); }
				return callback && callback(null, siteModel);
			}
		);
	};

	SiteService.prototype.retrieveSiteCache = function(callback) {
		var query = { 'username': this.siteUser, 'site': this.siteName };
		var projection = { 'cache': 1 };

		this.db.collection('sites').findOne(query, projection,
			function(error, siteModel) {
				if (error) { return callback && callback(error); }
				return callback && callback(null, siteModel.cache);
			}
		);
	};

	SiteService.prototype.updateSiteCache = function(cache, callback) {
		cache = cache || null;

		var query = { 'username': this.siteUser, 'site': this.siteName };
		var update = { $set: { 'cache': cache } };
		var options = { w: 1 };

		this.db.collection('sites').update(query, update, options,
			function(error, result) {
				if (error) { return callback && callback(error); }
				return callback && callback(null, result);
			}
		);
	};

	return SiteService;
})();
