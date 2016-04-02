'use strict';

var assert = require('assert');
var crypto = require('crypto');
var bcrypt = require('bcrypt');
var Hashes = require('jshashes');

var STRATEGY_BCRYPT = 'bcrypt';
var STRATEGY_SHA256 = 'sha256';

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
				return Promise.reject(new Error('Invalid password strategy: ' + strategy));
		}


		function validateSha256Password() {
			var SHA256_HASH_LENGTH = 64;
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

AuthenticationService.prototype.create = function(username, password, strategy, options) {
	options = options || {};

	try {
		assert(strategy, 'Missing authentication strategy');
	} catch(error) {
		return Promise.reject(error);
	}

	return generatePasswordHash(strategy, password, options)
		.then(function(hash) {
			return {
				strategy: strategy,
				username: username,
				password: hash
			};
		});


	function generatePasswordHash(strategy, password, options) {
		switch (strategy) {
			case STRATEGY_BCRYPT:
				return generateBcryptPasswordHash(password, options);
			case STRATEGY_SHA256:
				return generateSha256PasswordHash(password, options);
			default:
				return Promise.reject(new Error('Invalid strategy: ' + strategy));
		}

		function generateBcryptPasswordHash(password, options) {
			options = options || {};
			var strength = options.strength;

			try {
				assert(strength, 'Missing bcrypt strength');
				assert(typeof strength === 'number', 'Invalid bcrypt strength');
			} catch(error) {
				return Promise.reject(error);
			}

			return new Promise(function(resolve, reject) {
				bcrypt.hash(password, strength, function(error, hash) {
					if (error) { return reject(error); }
					return resolve(hash);
				});
			});
		}

		function generateSha256PasswordHash(password, options) {
			options = options || {};
			var saltLength = options.saltLength;

			try {
				assert(saltLength, 'Missing salt length');
				assert(typeof saltLength === 'number', 'Invalid salt length');
			} catch(error) {
				return Promise.reject(error);
			}

			return new Promise(function(resolve, reject) {
				var salt = generateRandomHexString(saltLength);
				var hash = new Hashes.SHA256().hex(salt + password);
				resolve(salt + hash);
			});


			function generateRandomHexString(length) {
				return crypto.randomBytes(length / 2).toString('hex');
			}
		}
	}
};

module.exports = AuthenticationService;
