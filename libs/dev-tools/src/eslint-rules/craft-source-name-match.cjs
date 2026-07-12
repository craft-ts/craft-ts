const { createNameMatchRule } = require('./craft-name-match-utils.cjs');

module.exports = createNameMatchRule({
  calleeName: 'source$',
  description:
    "Ensure source$(name) is called with a string literal first argument that matches the declared variable, class property, or object property name.",
  supportsObjectConfigForm: false,
});
