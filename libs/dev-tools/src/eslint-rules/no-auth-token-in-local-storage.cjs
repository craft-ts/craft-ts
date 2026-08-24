const { report } = require('./security-rule-utils.cjs');

module.exports = {
  meta: { type: 'problem', schema: [], docs: { description: 'Do not persist authentication material in browser storage.' } },
  create(context) {
    return { CallExpression(node) {
      const callee = node.callee;
      if (callee.type !== 'MemberExpression' || callee.property.type !== 'Identifier' || callee.property.name !== 'setItem') return;
      const owner = callee.object && callee.object.type === 'Identifier' ? callee.object.name : '';
      if (!/^(?:localStorage|sessionStorage)$/.test(owner)) return;
      const key = node.arguments[0];
      if (key && key.type === 'Literal' && /token|auth|jwt|session|refresh|password/i.test(String(key.value))) {
        report(context, node, 'Authentication tokens must not be stored in localStorage or sessionStorage.');
      }
    } };
  },
};
