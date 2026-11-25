'use strict';

const ts = require('typescript');
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
  if (node.type === 'CallExpression' && parseHyperscriptCall(node)) return 0;
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
  if (node.type === 'CallExpression' && parseHyperscriptCall(node)) return false;

  if (node.type === 'TemplateLiteral') {
    return (
      node.quasis.some((quasi) => quasi.value.cooked !== '') ||
      node.expressions.some((expression) => !isDirectTranslation(expression))
    );
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

const NUMERIC_OPERATORS = new Set(['+', '-', '*', '/', '%', '**']);
// Strings, numbers and bigints, with their literals, template literal types and
// enums.
const TEXT_TYPE_FLAGS =
  ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike | ts.TypeFlags.BigIntLike;
// Values a children array renders as nothing.
const IGNORED_TYPE_FLAGS =
  ts.TypeFlags.Undefined |
  ts.TypeFlags.Null |
  ts.TypeFlags.Void |
  ts.TypeFlags.BooleanLike |
  ts.TypeFlags.Never;

/**
 * Whether `type` is text a user reads once rendered: every rendered
 * constituent is a string, number or bigint. `any`, `unknown`, objects (nodes,
 * components) and mixed unions are not provably text.
 */
function isTextType(type) {
  const parts = type.isUnion?.() ? type.types : [type];
  const rendered = parts.filter((part) => (part.flags & IGNORED_TYPE_FLAGS) === 0);
  return (
    rendered.length > 0 &&
    rendered.every((part) => (part.flags & TEXT_TYPE_FLAGS) !== 0)
  );
}

/**
 * Whether a child expression renders as text, so that it would join an
 * adjacent translation into one visible message.
 *
 * Syntax proves text for literals, template literals, arithmetic and
 * concatenation. Element and component calls (`span(...)`, `Icon(...)`,
 * `ifNode(...)`, …) are separate nodes. Any other value — an identifier, a
 * member read or a call — is text only when typed lint proves its type is a
 * string or a number; without type information the rule stays silent rather
 * than mistake a node held in a variable for text.
 */
function isTextChild(node, typeOf) {
  if (!node) return false;
  switch (node.type) {
    case 'Literal':
      return (
        (typeof node.value === 'string' && node.value !== '') ||
        typeof node.value === 'number' ||
        typeof node.value === 'bigint'
      );
    case 'TemplateLiteral':
      return (
        node.expressions.length > 0 ||
        node.quasis.some((quasi) => quasi.value.cooked !== '')
      );
    case 'BinaryExpression':
      return NUMERIC_OPERATORS.has(node.operator);
    case 'UnaryExpression':
      return ['-', '+', '~', 'typeof'].includes(node.operator);
    case 'ConditionalExpression':
      return (
        isTextChild(node.consequent, typeOf) ||
        isTextChild(node.alternate, typeOf)
      );
    case 'LogicalExpression':
      return node.operator === '&&'
        ? isTextChild(node.right, typeOf)
        : isTextChild(node.left, typeOf) || isTextChild(node.right, typeOf);
    case 'ArrayExpression':
    case 'ObjectExpression':
    case 'SpreadElement':
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
      return false;
    case 'CallExpression':
      if (isTranslationCall(node)) return true;
      if (parseHyperscriptCall(node)) return false;
      return typeOf(node);
    default:
      return typeOf(node);
  }
}

/**
 * A children array composes a translation when a translated piece sits next to
 * another text piece: a literal, a text value or a second translation. An
 * element or component sibling is a separate visible position (#53).
 */
function isComposedChildren(node, sourceCode, typeOf) {
  let translations = 0;
  let texts = 0;
  for (const element of node.elements) {
    if (!element) continue;
    if (isTranslationCall(element)) {
      translations += 1;
    } else if (isTextChild(element, typeOf)) {
      if (translationCount(element, sourceCode) > 0) translations += 1;
      else texts += 1;
    }
  }
  return translations > 0 && translations + texts > 1;
}

function isComposedTranslation(node, sourceCode, typeOf) {
  if (node.type === 'ArrayExpression') {
    return isComposedChildren(node, sourceCode, typeOf);
  }

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

  return false;
}

function findComposedTranslation(node, sourceCode, typeOf) {
  if (!node || isTranslationCall(node)) return undefined;
  // A hyperscript or component call starts a separate visible position. Its
  // children are checked by that call's own listener; text inside a nested
  // span/button must not be composed with its sibling icon or controls.
  if (node.type === 'CallExpression') return undefined;
  if (isComposedTranslation(node, sourceCode, typeOf)) return node;

  for (const child of childNodes(node, sourceCode)) {
    const composed = findComposedTranslation(child, sourceCode, typeOf);
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

    const parserServices = sourceCode.parserServices ?? context.parserServices;
    const checker = parserServices?.program?.getTypeChecker?.();
    const nodeMap = parserServices?.esTreeNodeToTSNodeMap;
    // Without type information a non-literal value is not provably text.
    const typeOf = (node) => {
      const tsNode = checker && nodeMap?.get(node);
      return !!tsNode && isTextType(checker.getTypeAtLocation(tsNode));
    };

    return {
      CallExpression(node) {
        const call = parseHyperscriptCall(node);
        if (!call || !call.tag || !TEXT_HELPERS.has(call.tag)) return;

        for (const attribute of TEXT_ATTRIBUTES) {
          const entry = property(call.props, attribute);
          const composed = findComposedTranslation(
            entry?.value,
            sourceCode,
            typeOf,
          );
          if (composed) {
            context.report({ node: composed, messageId: 'composition' });
          }
        }

        const composed = findComposedTranslation(
          call.children,
          sourceCode,
          typeOf,
        );
        if (composed) {
          context.report({ node: composed, messageId: 'composition' });
        }
      },
    };
  },
};
