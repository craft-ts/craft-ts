const { createNameMatchRule } = require('./craft-name-match-utils.cjs');

module.exports = createNameMatchRule({
  calleeName: 'craftComponent',
  description:
    'Ensure craftComponent(name, ...) is called with a string literal name matching the declared component.',
  supportsObjectConfigForm: false,
});
