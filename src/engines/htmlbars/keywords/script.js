'use strict';

var Htmlbars = require('htmlbars/dist/cjs/htmlbars-runtime');

module.exports = function(morph, env, scope, params, hash, template, inverse, visitor) {
	if (template) {
		return blockScriptKeyword.apply(this, arguments);
	} else {
		return inlineScriptKeyword.apply(this, arguments);
	}
};

function inlineScriptKeyword(morph, env, scope, params, hash, template, inverse, visitor) {
	var currentValue = hash.src;
	var hasChanged = (morph.lastValue !== currentValue);
	if (!hasChanged) { return true; }
	var scriptElement = env.dom.createElement('script');
	scriptElement.setAttribute('src', currentValue);
	morph.setNode(scriptElement);
	morph.lastValue = currentValue;
	return true;
}

function blockScriptKeyword(morph, env, scope, params, hash, template, inverse, visitor) {
	var result = Htmlbars.render(template, env, scope, {
		contextualElement: morph.contextualElement
	});
	var currentValue = getFragmentText(result.fragment);
	var hasChanged = (morph.lastValue !== currentValue);
	if (!hasChanged) { return true; }
	morph.parseTextAsHTML = true;
	morph.setContent('<script>' + currentValue + '</script>');
	morph.lastValue = currentValue;
	return true;


	function getFragmentText(fragment) {
		var currentChild = result.fragment.firstChild;
		if (!currentChild) { return null; }
		var combinedValue = currentChild.nodeValue;
		while ((currentChild = currentChild.nextSibling)) { combinedValue += currentChild.nodeValue; }
		return combinedValue;
	}
}
