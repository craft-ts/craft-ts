'use strict';

const { NAMED_HTML_HELPER_SET } = require('./html-helpers.cjs');

function isStringLiteral(node) {
  return (
    !!node &&
    ((node.type === 'Literal' && typeof node.value === 'string') ||
      (node.type === 'TemplateLiteral' &&
        node.expressions.length === 0 &&
        node.quasis.length === 1))
  );
}

function stringLiteralValue(node) {
  if (!node) return undefined;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (
    node.type === 'TemplateLiteral' &&
    node.expressions.length === 0 &&
    node.quasis.length === 1
  ) {
    return node.quasis[0].value.cooked;
  }
  return undefined;
}

function isNullLiteral(node) {
  return (
    !!node &&
    (node.type === 'NullLiteral' ||
      (node.type === 'Literal' && node.value === null))
  );
}

function looksLikeChildren(node) {
  if (!node) return true;
  if (isNullLiteral(node) || node.type === 'Identifier' && node.name === 'undefined') {
    return true;
  }
  if (
    node.type === 'ArrayExpression' ||
    node.type === 'CallExpression' ||
    node.type === 'TemplateLiteral' ||
    (node.type === 'Literal' && typeof node.value === 'string') ||
    node.type === 'ArrowFunctionExpression' ||
    node.type === 'FunctionExpression'
  ) {
    return true;
  }
  return false;
}

function property(object, name) {
  if (!object || object.type !== 'ObjectExpression') return undefined;
  return object.properties.find(
    (entry) =>
      entry.type === 'Property' &&
      !entry.computed &&
      ((entry.key.type === 'Identifier' && entry.key.name === name) ||
        (entry.key.type === 'Literal' && entry.key.value === name)),
  );
}

function staticPropString(object, name) {
  const entry = property(object, name);
  if (!entry) return undefined;
  return stringLiteralValue(entry.value);
}

function hasProp(object, name) {
  return !!property(object, name);
}

function parseHelperArgs(args) {
  if (args.length === 0) {
    return { name: undefined, props: undefined, children: undefined };
  }
  const first = args[0];
  const second = args[1];
  const third = args[2];
  if (
    isStringLiteral(first) &&
    second &&
    (second.type === 'ObjectExpression' || isNullLiteral(second))
  ) {
    return {
      name: stringLiteralValue(first),
      props: second.type === 'ObjectExpression' ? second : undefined,
      children: third,
    };
  }
  if (first && first.type === 'ObjectExpression') {
    return { name: undefined, props: first, children: second };
  }
  return { name: undefined, props: undefined, children: first };
}

/**
 * Recognise a Craft hyperscript call: named helpers, `h('tag', …)`, and
 * `customElement('tag', …)`.
 */
function parseHyperscriptCall(node) {
  if (!node || node.type !== 'CallExpression' || node.callee.type !== 'Identifier') {
    return null;
  }
  const callee = node.callee.name;
  if (callee === 'h' || callee === 'customElement') {
    const tagNode = node.arguments[0];
    const tag = stringLiteralValue(tagNode);
    const rest = node.arguments.slice(1);
    let props;
    let children;
    if (rest[0] && rest[0].type === 'ObjectExpression') {
      props = rest[0];
      children = rest[1];
    } else if (rest[0] && looksLikeChildren(rest[0])) {
      children = rest[0];
    } else if (rest[0]) {
      props = rest[0];
      children = rest[1];
    }
    return {
      tag,
      tagNode,
      props,
      children,
      name: undefined,
      via: callee === 'h' ? 'h' : 'customElement',
      node,
      callee,
    };
  }
  if (!NAMED_HTML_HELPER_SET.has(callee) && callee !== 'heading' && callee !== 'liveRegion') {
    return null;
  }
  const parsed = parseHelperArgs(node.arguments);
  return {
    tag: callee === 'heading' ? 'heading' : callee === 'liveRegion' ? 'liveRegion' : callee,
    tagNode: node.callee,
    props: parsed.props,
    children: parsed.children,
    name: parsed.name,
    via: 'helper',
    node,
    callee,
  };
}

function walk(node, sourceCode, visit) {
  if (!node || typeof node.type !== 'string') return;
  const result = visit(node);
  if (result === 'skip') return;
  const keys = sourceCode.visitorKeys[node.type] ?? [];
  for (const key of keys) {
    const child = node[key];
    if (Array.isArray(child)) {
      child.forEach((item) => walk(item, sourceCode, visit));
    } else {
      walk(child, sourceCode, visit);
    }
  }
}

function staticTextContent(node) {
  if (!node) return '';
  if (isStringLiteral(node)) return stringLiteralValue(node) ?? '';
  if (node.type === 'ArrayExpression') {
    return node.elements.map((element) => staticTextContent(element)).join('');
  }
  if (node.type === 'CallExpression') {
    const call = parseHyperscriptCall(node);
    if (call) return staticTextContent(call.children);
    if (node.callee.type === 'Identifier' && node.arguments.length > 0) {
      return staticTextContent(node.arguments[node.arguments.length - 1]);
    }
  }
  return '';
}

function hasDynamicAccessibleName(children) {
  if (!children) return false;
  if (
    children.type === 'FunctionExpression' ||
    children.type === 'ArrowFunctionExpression' ||
    children.type === 'Identifier' ||
    children.type === 'MemberExpression'
  ) {
    return true;
  }
  if (children.type === 'CallExpression') {
    if (
      children.callee.type === 'Identifier' &&
      (children.callee.name === 'ifNode' ||
        children.callee.name === 'matchNode' ||
        children.callee.name === 'forNode')
    ) {
      return true;
    }
    return hasDynamicAccessibleName(
      children.arguments[children.arguments.length - 1],
    );
  }
  if (children.type === 'ArrayExpression') {
    return children.elements.some((element) => hasDynamicAccessibleName(element));
  }
  return false;
}

function hasAccessibleName(call) {
  if (!call) return false;
  if (hasProp(call.props, 'aria-label') || hasProp(call.props, 'aria-labelledby')) {
    const ariaLabel = staticPropString(call.props, 'aria-label');
    if (ariaLabel === '') return false;
    return true;
  }
  if (call.tag === 'img' || call.tag === 'area') {
    return hasProp(call.props, 'alt');
  }
  if (call.tag === 'input') {
    const type = staticPropString(call.props, 'type') ?? 'text';
    if (type === 'hidden') return true;
    if (type === 'image') return hasProp(call.props, 'alt');
    if (hasProp(call.props, 'title') || hasProp(call.props, 'placeholder')) {
      // placeholder-only is not a name; title can be
      return hasProp(call.props, 'title');
    }
    return false;
  }
  const text = staticTextContent(call.children).trim();
  if (text.length > 0) return true;
  if (hasDynamicAccessibleName(call.children)) return true;
  if (hasProp(call.props, 'title')) return true;
  return false;
}

module.exports = {
  isStringLiteral,
  stringLiteralValue,
  isNullLiteral,
  property,
  staticPropString,
  hasProp,
  parseHelperArgs,
  parseHyperscriptCall,
  walk,
  staticTextContent,
  hasAccessibleName,
};
