const { createPreferCraftSignalRule } = require('./prefer-craft-signal-utils.cjs');

module.exports = createPreferCraftSignalRule({
  angularName: 'effect',
  craftName: 'craftEffect',
  needsName: true,
  messageId: 'preferCraftEffect',
  message:
    "Angular effect() is forbidden. Use craftEffect('name', ...) from @craft-ng/core instead for observability and host name tracking.",
  description:
    'Disallow Angular effect() in favor of craftEffect() from @craft-ng/core.',
});
