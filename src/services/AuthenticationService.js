'use strict';

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
				throw new Error('Invalid password strategy: ' + strategy);
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

AuthenticationService.prototype.create = function(username, password, options) {
	options = options || {};
	var strategy = options.strategy || null;
	if (!strategy) { return Promise.reject('No authentication strategy specified'); }
	var strategyOptions = Object.keys(options).filter(
		function(key) { return key !== 'strategy'; }
	).reduce(function(strategyOptions, key) {
		strategyOptions[key] = options[key];
		return strategyOptions;
	}, {});

	return generatePasswordHash(strategy, password, strategyOptions)
		.then(function(hash) {
			return {
				strategy: strategy,
				username: username,
				password: hash
			};
		});


	function generatePasswordHash(strategy, password, strategyOptions) {
		switch (strategy) {
			case STRATEGY_BCRYPT:
				return generateBcryptPasswordHash(password, strategyOptions);
			case STRATEGY_SHA256:
				return generateSha256PasswordHash(password, strategyOptions);
			default:
				throw new Error('Invalid strategy: ' + strategy);
		}

		function generateBcryptPasswordHash(password, options) {
			options = options || {};
			var strength = options.strength;
			if (!strength) { return Promise.reject(new Error('No bcrypt strength specified')); }

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
			if (!saltLength) { return Promise.reject(new Error('No SHA256 salt length specified')); }

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
