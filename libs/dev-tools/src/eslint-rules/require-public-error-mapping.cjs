const { report, isCallNamed } = require('./security-rule-utils.cjs');

module.exports = {
  meta: {
    type: 'problem',
    schema: [],
    docs: { description: 'Require an explicit public server error catalogue.' },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!isCallNamed(node, 'createServer')) return;
        const options = node.arguments[0];
        if (!options || options.type !== 'ObjectExpression') return;
        const property = (name) =>
          options.properties.find(
            (candidate) =>
              candidate.type === 'Property' &&
              (candidate.key.name ?? candidate.key.value) === name,
          );
        if (!property('functions')) return;
        const catalogue = property('publicErrors');
        if (!catalogue) {
          report(context, node, 'createServer requires a publicErrors catalogue.');
          return;
        }
        // Un catalogue vide passait les contrôles sans rien décrire.
        if (
          catalogue.value.type === 'ObjectExpression' &&
          catalogue.value.properties.length === 0
        ) {
          report(
            context,
            node,
            'An empty publicErrors catalogue maps nothing; list the tags the application exposes.',
          );
        }
      },
    };
  },
};
