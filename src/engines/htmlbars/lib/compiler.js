'use strict';

var util = require('util');
var objectAssign = require('object-assign');
var HtmlbarsCompiler = require('htmlbars/dist/cjs/htmlbars-compiler/compiler');
var HtmlbarsSyntaxParser = require('htmlbars/dist/cjs/htmlbars-syntax/parser');
var HtmlbarsTemplateCompiler = require('htmlbars/dist/cjs/htmlbars-compiler/template-compiler');
var HydrationOpcodeCompiler = require('htmlbars/dist/cjs/htmlbars-compiler/hydration-opcode-compiler');
var HtmlbarsRuntimeHooks = require('htmlbars/dist/cjs/htmlbars-runtime/hooks');
var HtmlbarsRuntimeRender = require('htmlbars/dist/cjs/htmlbars-runtime/render').default;

module.exports = objectAssign({}, HtmlbarsCompiler, {
	compileSpec: function(string, options) {
		var ast = HtmlbarsSyntaxParser.preprocess(string, options);
		var compiler = new HtmlbarsTemplateCompiler(options);

		// HACK: override the hydration opcode compiler to convert partials
		compiler.hydrationOpcodeCompiler = new ExtendedHydrationOpcodeCompiler();

		var program = compiler.compile(ast);
		return program;
	},
	compile: function(string, options) {
		return HtmlbarsRuntimeHooks.wrap(this.template(this.compileSpec(string, options)), HtmlbarsRuntimeRender);
	}
});

function ExtendedHydrationOpcodeCompiler() {
	HydrationOpcodeCompiler.call(this);
}
util.inherits(ExtendedHydrationOpcodeCompiler, HydrationOpcodeCompiler);

ExtendedHydrationOpcodeCompiler.prototype.mustache = function(mustache, childIndex, childCount) {
	if (mustache.type === 'PartialStatement') {
		mustache.hash = {
			pairs: [],
			type: 'Hash'
		};
		mustache.path = {
			original: 'partial',
			parts: ['partial']
		};
		mustache.params = [
			{
				type: 'StringLiteral',
				original: mustache.name.original,
				value: mustache.name.parts[0]
			}
		];
	}
	return HydrationOpcodeCompiler.prototype.mustache.call(this, mustache, childIndex, childCount);
};
