module.exports = (function() {
	'use strict';

	var Hashes = require('jshashes');

	var SALT_LENGTH = 40;

	function AuthenticationService() {

	}

	AuthenticationService.prototype.authenticate = function(username, password, validUsers) {
		if (!(validUsers instanceof Array)) { validUsers = [validUsers]; }
		var authenticatedUser = null;
		var isAuthenticated = validUsers.some(function(user) {
			if (username !== user.username) { return false; }
			var saltedPassword = user.salt + password;
			var hashedPassword = new Hashes.SHA256().hex(saltedPassword);
			var isAuthenticated = (hashedPassword === user.password);
			if (isAuthenticated) { authenticatedUser = user; }
			return isAuthenticated;
		});
		return (isAuthenticated ? authenticatedUser : false);
	};

	AuthenticationService.prototype.create = function(username, password) {
		var salt = _generateRandomString(SALT_LENGTH);
		var saltedPassword = salt + password;
		var hashedPassword = new Hashes.SHA256().hex(saltedPassword);
		return {
			username: username,
			password: hashedPassword,
			salt: salt
		};
	};

	return AuthenticationService;


	function _generateRandomString(length, characters) {
		characters = characters || '!"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~';
		var string = '';
		while (string.length < length) { string += characters.charAt(Math.floor(Math.random() * characters.length)); }
		return string;
	}
})();
