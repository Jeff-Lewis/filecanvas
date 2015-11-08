'use strict';

// FIXME: This shim can be removed once HTMLbars is fixed
// Issue tracker: https://github.com/tildeio/htmlbars/pull/432

var Hooks = require('htmlbars/dist/cjs/htmlbars-runtime/hooks');
var Render = require('htmlbars/dist/cjs/htmlbars-runtime/render');
var MorphUtils = require('htmlbars/dist/cjs/htmlbars-util/morph-utils');
var TemplateUtils = require('htmlbars/dist/cjs/htmlbars-util/template-utils');

exports.hooks = Hooks.default;
exports.render = Render.default;
exports.internal = {
  blockFor: TemplateUtils.blockFor,
  manualElement: Render.manualElement,
  hostBlock: Hooks.hostBlock,
  continueBlock: Hooks.continueBlock,
  hostYieldWithShadowTemplate: Hooks.hostYieldWithShadowTemplate,
  visitChildren: MorphUtils.visitChildren,
  validateChildMorphs: MorphUtils.validateChildMorphs,
  clearMorph: TemplateUtils.clearMorph
};
