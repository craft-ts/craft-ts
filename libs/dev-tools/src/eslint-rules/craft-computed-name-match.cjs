const { createNameMatchRule } = require('./craft-name-match-utils.cjs');

module.exports = createNameMatchRule({
  calleeName: 'craftComputed',
  description:
    "Ensure craftComputed(name, ...) is called with a string literal first argument that matches the declared variable or class property name.",
  supportsObjectConfigForm: false,
});
