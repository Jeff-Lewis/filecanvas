'use strict';

var merge = require('lodash.merge');
var Htmlbars = require('./htmlbars-runtime');

var keywords = require('./keywords');

module.exports = merge({}, Htmlbars.hooks, {
	keywords: keywords,
	bindSelf: function(env, scope, self) {
		var result = Htmlbars.hooks.bindSelf.apply(this, arguments);
		this.bindLocal(env, scope, '@root', self);
		return result;
	}
});
