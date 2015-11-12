'use strict';

var Htmlbars = require('../htmlbars-runtime');

module.exports = function(morph, env, scope, params, hash, template, inverse, visitor) {
	var scriptElement = env.dom.createElement('script');
	if (template) {
		var result = Htmlbars.render(template, env, scope, {});
		scriptElement.appendChild(result.fragment);
	} else {
		scriptElement.setAttribute('src', hash.src);
	}
	morph.setNode(scriptElement);
	return true;
};
