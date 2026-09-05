'use strict';

const { parseHyperscriptCall, property } = require('./hyperscript-walk.cjs');

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

function isTranslationCall(node) {
  if (!node || node.type !== 'CallExpression') return false;

  if (node.callee.type === 'Identifier') {
    return node.callee.name === 't' || node.callee.name === 'translate';
  }

  return (
    node.callee.type === 'MemberExpression' &&
    !node.callee.computed &&
    !node.callee.optional &&
    node.callee.property.type === 'Identifier' &&
    (node.callee.property.name === 't' ||
      node.callee.property.name === 'translate')
  );
}

function childNodes(node, sourceCode) {
  const children = [];
  for (const key of sourceCode.visitorKeys[node.type] ?? []) {
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) if (item?.type) children.push(item);
    } else if (child?.type) {
      children.push(child);
    }
  }
  return children;
}

function translationCount(node, sourceCode) {
  if (!node) return 0;
  if (isTranslationCall(node)) return 1;
  return childNodes(node, sourceCode).reduce(
    (count, child) => count + translationCount(child, sourceCode),
    0,
  );
}

function isDirectTranslation(node) {
  return isTranslationCall(node);
}

function hasOtherPiece(node, sourceCode) {
  if (!node) return false;
  if (isTranslationCall(node)) return false;

  if (node.type === 'TemplateLiteral') {
    return (
      node.quasis.some((quasi) => quasi.value.cooked !== '') ||
      node.expressions.some((expression) => !isDirectTranslation(expression))
    );
  }

  if (node.type === 'ArrayExpression') {
    return node.elements.some((element) => !isDirectTranslation(element));
  }

  if (node.type === 'BinaryExpression' && node.operator === '+') {
    return (
      hasOtherPiece(node.left, sourceCode) ||
      hasOtherPiece(node.right, sourceCode)
    );
  }

  // A non-translation expression is a second piece when it sits next to a
  // translation in a composition. This includes identifiers, formatter calls,
  // generator expressions and conditional expressions.
  return true;
}

function isComposedTranslation(node, sourceCode) {
  const count = translationCount(node, sourceCode);
  if (count === 0) return false;

  if (node.type === 'BinaryExpression' && node.operator === '+') {
    return (
      count > 1 ||
      hasOtherPiece(node.left, sourceCode) ||
      hasOtherPiece(node.right, sourceCode)
    );
  }

  if (node.type === 'TemplateLiteral') {
    return count > 1 || hasOtherPiece(node, sourceCode);
  }

  if (node.type === 'ArrayExpression') {
    return count > 1 || hasOtherPiece(node, sourceCode);
  }

  return false;
}

function findComposedTranslation(node, sourceCode) {
  if (!node || isTranslationCall(node)) return undefined;
  if (isComposedTranslation(node, sourceCode)) return node;

  for (const child of childNodes(node, sourceCode)) {
    const composed = findComposedTranslation(child, sourceCode);
    if (composed) return composed;
  }

  return undefined;
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
        'Require complete visible messages to be translated with parameters instead of composing translated text with other values.',
      url: 'https://craft-ts.github.io/craft/guide/i18n/#translation-parameters',
    },
    schema: [],
    messages: {
      composition:
        "Do not compose translated text with other text or values. Put the complete message in the i18n catalogue and pass dynamic values as translation parameters (for example, i18n.t('ui.space.expires', { expiresAt })). See https://craft-ts.github.io/craft/guide/i18n/#translation-parameters.",
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    if (isIgnoredFile(context.filename ?? context.getFilename())) return {};

    return {
      CallExpression(node) {
        const call = parseHyperscriptCall(node);
        if (!call || !call.tag || !TEXT_HELPERS.has(call.tag)) return;

        for (const attribute of TEXT_ATTRIBUTES) {
          const entry = property(call.props, attribute);
          const composed = findComposedTranslation(entry?.value, sourceCode);
          if (composed) {
            context.report({ node: composed, messageId: 'composition' });
          }
        }

        const composed = findComposedTranslation(call.children, sourceCode);
        if (composed) {
          context.report({ node: composed, messageId: 'composition' });
        }
      },
    };
  },
};
