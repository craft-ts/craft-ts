const { createNameMatchRule } = require('./craft-name-match-utils.cjs');

module.exports = createNameMatchRule({
  calleeName: 'craftMethod',
  description:
    "Ensure craftMethod(name, ...) is called with a string literal first argument (or { name } object) that matches the declared variable or class property name.",
  supportsObjectConfigForm: true,
});
