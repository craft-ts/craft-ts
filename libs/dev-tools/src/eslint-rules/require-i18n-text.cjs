'use strict';

const { parseHyperscriptCall, property } = require('./hyperscript-walk.cjs');

// These are the positions where a literal becomes text that a user can read.
// Keep the list deliberately small: business values and technical strings are
// not translations, and the rule must not turn into a ban on string literals.
const TEXT_HELPERS = new Set([
  'heading',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'label',
  'button',
  'a',
  'option',
  'span',
  'strong',
  'small',
  'legend',
  'figcaption',
  'caption',
  'input',
  'textarea',
  'select',
]);

const TEXT_ATTRIBUTES = new Set(['placeholder', 'aria-label', 'title']);

// Copy has letters. A separator (`' '`, `' — '`, `':'`) is glue between values,
// not something a translator would ever be handed, and reporting it would only
// teach people to silence the rule.
const CARRIES_COPY = /\p{L}/u;

function carriesCopy(text) {
  return typeof text === 'string' && CARRIES_COPY.test(text);
}

/**
 * Walks a visible position and reports every literal that is copy — including
 * the ones sitting next to a translated value.
 *
 * It descends only through the shapes that keep text *in place* on screen
 * (concatenation, ternary, fallback, list, template text). A call is a value
 * the application supplies, so `i18n.t('key')` is accepted and its key is never
 * mistaken for copy; a function child stays the application's business too.
 */
function reportCopyLiterals(node, report, depth = 0) {
  if (!node || depth > 8) return;
  switch (node.type) {
    case 'Literal':
      if (carriesCopy(node.value)) report(node);
      return;
    case 'TemplateLiteral':
      // `${…}` holes are values; the text around them is copy.
      if (node.quasis.some((quasi) => carriesCopy(quasi.value.cooked)))
        report(node);
      return;
    case 'BinaryExpression':
      if (node.operator !== '+') return;
      reportCopyLiterals(node.left, report, depth + 1);
      reportCopyLiterals(node.right, report, depth + 1);
      return;
    case 'ConditionalExpression':
      reportCopyLiterals(node.consequent, report, depth + 1);
      reportCopyLiterals(node.alternate, report, depth + 1);
      return;
    case 'LogicalExpression':
      reportCopyLiterals(node.left, report, depth + 1);
      reportCopyLiterals(node.right, report, depth + 1);
      return;
    case 'ArrayExpression':
      for (const element of node.elements)
        reportCopyLiterals(element, report, depth + 1);
      return;
    default:
      return;
  }
}

function isIgnoredFile(filename) {
  const normalized = filename.replaceAll('\\', '/');
  return (
    normalized.includes('/src/i18n/') ||
    normalized.includes('/server/') ||
    normalized.endsWith('.fn-serveur.ts') ||
    normalized.endsWith('.server.ts') ||
    normalized.includes('/test/') ||
    normalized.includes('/tests/') ||
    normalized.endsWith('.spec.ts') ||
    normalized.endsWith('.test.ts')
  );
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require user-visible Craft hyperscript text and labels to come from the typed i18n runtime.',
      url: 'https://craft-ts.github.io/craft/guide/i18n/',
    },
    schema: [],
    messages: {
      literal:
        'Visible text must come from i18n.t(...) (or a translation helper). Move this literal to the i18n catalogue; dynamic business values remain allowed.',
      attribute:
        'The {{attribute}} value must come from i18n.t(...) (or a translation helper). Move this user-visible string to the i18n catalogue.',
    },
  },
  create(context) {
    // `context.getFilename()` was removed in ESLint 10; `context.filename` is
    // the supported reader and already exists in 9.
    if (isIgnoredFile(context.filename ?? context.getFilename())) return {};

    return {
      CallExpression(node) {
        const call = parseHyperscriptCall(node);
        if (!call || !call.tag || !TEXT_HELPERS.has(call.tag)) return;

        for (const attribute of TEXT_ATTRIBUTES) {
          const entry = property(call.props, attribute);
          if (!entry) continue;
          reportCopyLiterals(entry.value, (node) =>
            context.report({
              node,
              messageId: 'attribute',
              data: { attribute },
            }),
          );
        }

        // A function, identifier, member expression or translation call is a
        // value supplied by the application. It is intentionally accepted.
        reportCopyLiterals(call.children, (node) =>
          context.report({ node, messageId: 'literal' }),
        );
      },
    };
  },
};
