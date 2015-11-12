'use strict';

var Htmlbars = require('../htmlbars-runtime');

module.exports = function(env, scope, self) {
	var result = Htmlbars.hooks.bindSelf.apply(this, arguments);
	this.bindLocal(env, scope, '@root', self);
	return result;
};
