const { createNameMatchRule } = require('./craft-name-match-utils.cjs');

module.exports = createNameMatchRule({
  calleeName: 'craftDirective',
  description:
    'Ensure craftDirective(name, ...) is called with a string literal name matching the declared directive.',
  supportsObjectConfigForm: false,
});
