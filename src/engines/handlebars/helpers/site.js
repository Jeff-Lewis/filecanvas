'use strict';

module.exports['loginUrl'] = function() {
	return this['@root'].metadata.siteRoot + 'login';
};
module.exports['logoutUrl'] = function() {
	return this['@root'].metadata.siteRoot + 'logout';
};
module.exports['resourceUrl'] = function(filePath) {
	return this['@root'].metadata.themeRoot + filePath;
};
module.exports['downloadUrl'] = function(file) {
	return this['@root'].metadata.siteRoot + 'download' + file.path;
};
module.exports['thumbnailUrl'] = function(file) {
	return this['@root'].metadata.siteRoot + 'thumbnail' + file.path;
};
