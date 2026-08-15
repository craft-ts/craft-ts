'use strict';

const { parseHyperscriptCall } = require('./hyperscript-walk.cjs');

const TRANSPARENT = new Set([
  'ifBlock',
  'each',
  'matchBlock',
  'catchBlock',
  'pendingBlock',
  'defer',
  'craftTemplate',
]);

function headingLevelOf(call) {
  if (!call?.tag) return undefined;
  if (call.tag === 'heading') return 'relative';
  const match = /^h([1-6])$/.exec(call.tag);
  return match ? Number(match[1]) : undefined;
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Walk a Craft template and reject heading-level skips (h1 then h3, or headingSection that jumps a rank).',
    },
    schema: [],
    messages: {
      skip: 'Heading level skips from {{from}} to {{to}}. Insert the intermediate headingSection or heading.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    function visitTemplate(templateNode) {
      let current = 0;
      let lastEmitted = 0;

      function walkCall(node, sectionDepth) {
        if (!node || typeof node.type !== 'string') return;
        if (node.type === 'CallExpression' && node.callee.type === 'Identifier') {
          const name = node.callee.name;
          if (name === 'headingSection') {
            walkCall(node.arguments[0], sectionDepth + 1);
            return;
          }
          if (TRANSPARENT.has(name)) {
            for (const arg of node.arguments) walkCall(arg, sectionDepth);
            return;
          }
          const call = parseHyperscriptCall(node);
          const level = headingLevelOf(call);
          if (level === 'relative') {
            const emitted = Math.max(1, sectionDepth + 1);
            if (lastEmitted > 0 && emitted > lastEmitted + 1) {
              context.report({
                node,
                messageId: 'skip',
                data: { from: String(lastEmitted), to: String(emitted) },
              });
            }
            lastEmitted = Math.max(lastEmitted, emitted);
            current = emitted;
          } else if (typeof level === 'number') {
            if (lastEmitted > 0 && level > lastEmitted + 1) {
              context.report({
                node,
                messageId: 'skip',
                data: { from: String(lastEmitted), to: String(level) },
              });
            }
            lastEmitted = Math.max(lastEmitted, level);
            current = level;
          }
        }
        const keys = sourceCode.visitorKeys[node.type] ?? [];
        for (const key of keys) {
          const child = node[key];
          if (Array.isArray(child)) child.forEach((item) => walkCall(item, sectionDepth));
          else walkCall(child, sectionDepth);
        }
      }

      walkCall(templateNode, current);
    }

    return {
      CallExpression(node) {
        if (
          node.callee.type === 'Identifier' &&
          node.callee.name === 'craftComponent' &&
          node.arguments.length >= 4
        ) {
          visitTemplate(node.arguments[3]);
        }
      },
    };
  },
};
