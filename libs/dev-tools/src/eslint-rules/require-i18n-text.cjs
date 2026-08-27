'use strict';

const {
  parseHyperscriptCall,
  property,
  stringLiteralValue,
} = require('./hyperscript-walk.cjs');

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

function isStaticText(node) {
  return stringLiteralValue(node) !== undefined;
}

function isI18nCall(node) {
  return (
    node &&
    node.type === 'CallExpression' &&
    node.callee &&
    ((node.callee.type === 'MemberExpression' &&
      !node.callee.computed &&
      node.callee.property.type === 'Identifier' &&
      (node.callee.property.name === 't' ||
        node.callee.property.name === 'translate')) ||
      (node.callee.type === 'Identifier' &&
        (node.callee.name === 't' || node.callee.name === 'translate')))
  );
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
    if (isIgnoredFile(context.getFilename())) return {};

    return {
      CallExpression(node) {
        const call = parseHyperscriptCall(node);
        if (!call || !call.tag || !TEXT_HELPERS.has(call.tag)) return;

        for (const attribute of TEXT_ATTRIBUTES) {
          const entry = property(call.props, attribute);
          if (!entry || !isStaticText(entry.value) || isI18nCall(entry.value))
            continue;
          context.report({
            node: entry.value,
            messageId: 'attribute',
            data: { attribute },
          });
        }

        const children = call.children;
        // A function, identifier, member expression or translation call is a
        // value supplied by the application. It is intentionally accepted.
        if (isStaticText(children) && !isI18nCall(children)) {
          context.report({ node: children, messageId: 'literal' });
        }
      },
    };
  },
};
