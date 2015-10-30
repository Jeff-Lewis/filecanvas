'use strict';

module.exports['loginUrl'] = function() {
	return this['@root'].siteRoot + 'login';
};
module.exports['logoutUrl'] = function() {
	return this['@root'].siteRoot + 'logout';
};
module.exports['resourceUrl'] = function(filePath) {
	return this['@root'].themeRoot + filePath;
};
module.exports['downloadUrl'] = function(file) {
	return this['@root'].siteRoot + 'download' + file.path;
};
module.exports['thumbnailUrl'] = function(file) {
	return this['@root'].siteRoot + 'thumbnail' + file.path;
};
