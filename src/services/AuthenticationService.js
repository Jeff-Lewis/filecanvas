'use strict';

var bcrypt = require('bcrypt');
var Hashes = require('jshashes');

var STRATEGY_BCRYPT = 'bcrypt';
var STRATEGY_SHA256 = 'sha256';

var BCRYPT_STRENGTH = 10;
var SHA256_HASH_LENGTH = 64;

function AuthenticationService() {
}

AuthenticationService.prototype.authenticate = function(username, password, validUsers) {
	if (!(validUsers instanceof Array)) { validUsers = [validUsers]; }

	var matchingUser = getMatchingUser(username, validUsers);
	if (!matchingUser) { return Promise.resolve(false); }

	return validatePassword(password, matchingUser.strategy, matchingUser.password)
		.then(function(isValid) {
			if (!isValid) { return false; }
			return matchingUser;
		});


	function getMatchingUser(username, validUsers) {
		return validUsers.filter(function(user) {
			return user.username === username;
		})[0] || null;
	}

	function validatePassword(password, strategy, validPasswordHash) {
		switch (strategy) {
			case STRATEGY_BCRYPT:
				return validateBcryptPassword(password, validPasswordHash);
			case STRATEGY_SHA256:
				return validateSha256Password(password, validPasswordHash);
			default:
				throw new Error('Invalid password strategy: ' + strategy);
		}


		function validateSha256Password() {
			var salt = validPasswordHash.slice(0, -SHA256_HASH_LENGTH);
			var validHash = validPasswordHash.slice(-SHA256_HASH_LENGTH);
			var saltedPassword = salt + password;
			var hashedPassword = new Hashes.SHA256().hex(saltedPassword);
			var isValid = (hashedPassword === validHash);
			return Promise.resolve(isValid);
		}

		function validateBcryptPassword(password, validPasswordHash) {
			return new Promise(function(resolve, reject) {
				bcrypt.compare(password, matchingUser.password, function(error, isValid) {
					if (error) { return reject(error); }
					resolve(isValid);
				});
			});
		}
	}
};

AuthenticationService.prototype.create = function(username, password) {
	return generatePasswordHash(password)
		.then(function(hash) {
			return {
				strategy: STRATEGY_BCRYPT,
				username: username,
				password: hash
			};
		});


	function generatePasswordHash(password) {
		return new Promise(function(resolve, reject) {
			bcrypt.hash(password, BCRYPT_STRENGTH, function(error, hash) {
				if (error) { return reject(error); }
				return resolve(hash);
			});
		});
	}
};

module.exports = AuthenticationService;
