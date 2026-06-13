const { createPreferCraftSignalRule } = require('./prefer-craft-signal-utils.cjs');

module.exports = createPreferCraftSignalRule({
  angularName: 'signal',
  craftName: 'state',
  needsName: false,
  messageId: 'preferCraftState',
  message:
    'Angular signal() is forbidden. Use state() from @craft-ng/core instead for observability and host name tracking.',
  description:
    'Disallow Angular signal() in favor of state() from @craft-ng/core.',
});
