const { report, isCallNamed } = require('./security-rule-utils.cjs');

function hasProperty(node, name) {
  if (!node || node.type !== 'ObjectExpression') return false;
  return node.properties.some((property) => {
    // Un spread peut porter la propriété : on ne peut pas prouver son
    // absence, et une règle qui accuse à tort finit désactivée.
    if (property.type === 'SpreadElement') return true;
    return (
      property.type === 'Property' &&
      (property.key.name ?? property.key.value) === name
    );
  });
}

module.exports = {
  meta: {
    type: 'problem',
    schema: [],
    docs: { description: 'Require an explicit SSR transfer policy.' },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (isCallNamed(node, 'captureCraftTransferSnapshot')) {
          if (node.arguments.length < 2 || !hasProperty(node.arguments[1], 'policy')) {
            report(
              context,
              node,
              'SSR transfer requires an explicit policy: captureCraftTransferSnapshot(registry, { policy }).',
            );
          }
          return;
        }
        // Un rendu sans politique retombe sur le défaut fermé : le signaler
        // évite de découvrir en production que rien ne s'hydrate.
        if (isCallNamed(node, 'renderCraft')) {
          const options = node.arguments[0];
          if (
            options &&
            options.type === 'ObjectExpression' &&
            !hasProperty(options, 'securityPolicy')
          ) {
            report(
              context,
              node,
              'renderCraft requires an explicit securityPolicy: the transfer snapshot is empty without one.',
            );
          }
        }
      },
    };
  },
};
