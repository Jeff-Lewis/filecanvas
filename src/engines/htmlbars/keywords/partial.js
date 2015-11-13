'use strict';

var objectAssign = require('object-assign');
var Htmlbars = require('../htmlbars-runtime');
var templateUtils = require('htmlbars/dist/cjs/htmlbars-util/template-utils');

var partialKeyword = require('@timkendrick/ember-htmlbars-helpers').keywords.partial;

module.exports = objectAssign({}, partialKeyword, {
	render: function(renderNode, env, scope, params, hash, template, inverse, visitor) {
		if (template) {
			var block = templateUtils.blockFor(Htmlbars.render, template, { self: scope.self });
			env.hooks.bindBlock(env, scope, block);
		}
		return partialKeyword.render.apply(this, arguments);
	}
});
