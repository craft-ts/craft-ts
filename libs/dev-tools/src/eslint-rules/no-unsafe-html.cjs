const { report } = require('./security-rule-utils.cjs');

const RAW_SINKS = /^(?:innerHTML|outerHTML|srcdoc)$/;
const DANGEROUS_CALLS = new Set([
  'insertAdjacentHTML',
  'createContextualFragment',
  'write',
  'writeln',
]);

/** `unsafeHtml(...)` n'est acceptable qu'accompagné d'une exception datée. */
function hasRecordedException(sourceCode) {
  return /allowUnsafe\s*\(/.test(sourceCode);
}

module.exports = {
  meta: {
    type: 'problem',
    schema: [],
    docs: { description: 'Require an explicit Craft HTML sanitizer.' },
  },
  create(context) {
    const sourceCode = (context.sourceCode ?? context.getSourceCode()).getText();
    return {
      AssignmentExpression(node) {
        if (
          node.left.type === 'MemberExpression' &&
          !node.left.computed &&
          node.left.property.type === 'Identifier' &&
          RAW_SINKS.test(node.left.property.name)
        ) {
          report(
            context,
            node,
            'Raw HTML and srcdoc assignments are forbidden; use sanitizedHtml or an audited unsafeHtml exception.',
          );
        }
      },
      CallExpression(node) {
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'unsafeHtml' &&
          !hasRecordedException(sourceCode)
        ) {
          report(
            context,
            node,
            'unsafeHtml requires an allowUnsafe(...) exception with an owner, a reason, a risk and an expiry date.',
          );
          return;
        }
        if (
          node.callee.type === 'Identifier' &&
          (node.callee.name === 'eval' || node.callee.name === 'Function')
        ) {
          report(context, node, 'Dynamic code evaluation is forbidden.');
          return;
        }
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.property.type === 'Identifier' &&
          DANGEROUS_CALLS.has(node.callee.property.name)
        ) {
          const owner =
            node.callee.object.type === 'Identifier'
              ? node.callee.object.name
              : '';
          if (
            node.callee.property.name !== 'write' &&
            node.callee.property.name !== 'writeln'
          ) {
            report(
              context,
              node,
              `${node.callee.property.name} is forbidden; use the Craft sanitized HTML API.`,
            );
          } else if (owner === 'document') {
            report(
              context,
              node,
              'document.write injects unparsed markup; use the Craft sanitized HTML API.',
            );
          }
        }
      },
      NewExpression(node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'Function') {
          report(context, node, 'Dynamic code evaluation is forbidden.');
        }
      },
    };
  },
};
