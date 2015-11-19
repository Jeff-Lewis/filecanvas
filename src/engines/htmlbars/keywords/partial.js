'use strict';

var objectAssign = require('object-assign');
var Htmlbars = require('htmlbars/dist/cjs/htmlbars-runtime');
var templateUtils = require('htmlbars/dist/cjs/htmlbars-util/template-utils');

var partialKeyword = require('@timkendrick/ember-htmlbars-helpers').keywords.partial;

module.exports = objectAssign({}, partialKeyword, {
	render: function(renderNode, env, scope, params, hash, template, inverse, visitor) {
		if (template) {
			var block = templateUtils.blockFor(Htmlbars.render, template, { self: scope.self });
			env.hooks.bindBlock(env, scope, block);
		}
		var childScope = env.hooks.createChildScope(scope);
		Object.keys(hash).forEach(function(key) {
			env.hooks.bindLocal(env, childScope, key, hash[key]);
		});
		return partialKeyword.render.call(this, renderNode, env, childScope, params, hash, template, inverse, visitor);
	}
});
