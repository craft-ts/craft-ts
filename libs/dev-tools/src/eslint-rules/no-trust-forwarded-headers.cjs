const { report } = require('./security-rule-utils.cjs');

const FORWARDED = /^x-forwarded-(?:for|host|proto)$/i;

module.exports = {
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        properties: {
          // Frontière proxy de confiance : le fichier qui valide ces en-têtes
          // doit pouvoir les lire, sinon la règle n'est pas tenable.
          allowIn: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    docs: {
      description:
        'Do not trust forwarded headers outside the configured proxy boundary.',
    },
  },
  create(context) {
    const allowIn = (context.options[0] && context.options[0].allowIn) || [
      'proxy-boundary',
      'trusted-proxy',
    ];
    const filename = context.filename ?? context.getFilename();
    if (allowIn.some((fragment) => filename.includes(fragment))) return {};
    return {
      Literal(node) {
        if (typeof node.value === 'string' && FORWARDED.test(node.value)) {
          report(
            context,
            node,
            'Forwarded headers are untrusted input; read them only in the proxy boundary module that validates them.',
          );
        }
      },
    };
  },
};
