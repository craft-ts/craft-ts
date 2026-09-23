'use strict';

/**
 * Shared by `no-raw-class`, `no-inline-style` and `no-component-css`: where a
 * value bound to `class:` / `style:` comes from.
 *
 * The question these rules ask is always the same — "does this value trace
 * back to the design system?" — and the answer is syntactic on purpose. A
 * type-aware answer would need `parserOptions.project` in every consumer, and a
 * rule that silently does nothing without it is a rule nobody notices is off.
 */

const STYLE_PACKAGE = '@craft-ts/style';

/** `./badge.style`, `../ui/badge.style.ts`, `@app/ui/foundation.style.js`. */
const STYLE_MODULE = /\.style(\.[cm]?[jt]s)?$/;

const isStyleModule = (source) =>
  typeof source === 'string' && STYLE_MODULE.test(source);

/** The variable an identifier refers to, walking up the scopes. */
function findVariable(sourceCode, identifier) {
  let scope = sourceCode.getScope ? sourceCode.getScope(identifier) : undefined;
  while (scope) {
    const variable = scope.set.get(identifier.name);
    if (variable) return variable;
    scope = scope.upper;
  }
  return undefined;
}

/**
 * What an identifier is bound to:
 * - `{ kind: 'import', source, imported }` for an import;
 * - `{ kind: 'param' }` for a function parameter (a typed input);
 * - `{ kind: 'const', init }` for a `const` with an initialiser;
 * - `{ kind: 'unknown' }` otherwise.
 */
function bindingOf(sourceCode, identifier) {
  const variable = findVariable(sourceCode, identifier);
  const definition = variable?.defs?.[0];
  if (!definition) return { kind: 'unknown' };
  if (definition.type === 'ImportBinding') {
    const declaration = definition.parent;
    const specifier = definition.node;
    return {
      kind: 'import',
      source: declaration?.source?.value,
      imported:
        specifier.type === 'ImportSpecifier'
          ? (specifier.imported.name ?? specifier.imported.value)
          : specifier.type === 'ImportDefaultSpecifier'
            ? 'default'
            : '*',
    };
  }
  if (definition.type === 'Parameter') return { kind: 'param' };
  if (
    definition.type === 'Variable' &&
    definition.parent?.kind === 'const' &&
    definition.node?.id?.type === 'Identifier' &&
    definition.node.init
  ) {
    return { kind: 'const', init: definition.node.init };
  }
  return { kind: 'unknown' };
}

/** The leftmost identifier of `a.b.c`, or undefined. */
function rootIdentifier(node) {
  let current = node;
  while (current && current.type === 'MemberExpression') {
    current = current.object;
  }
  return current && current.type === 'Identifier' ? current : undefined;
}

const isNullish = (node) =>
  (node.type === 'Literal' && (node.value === null || node.value === false)) ||
  (node.type === 'Identifier' && node.name === 'undefined');

/**
 * The expressions a function-valued binding can produce: the body of an
 * arrow, or every `return` of a block — `yield` included, for generator
 * bindings. `undefined` when a return has no argument.
 */
function returnedExpressions(fn) {
  if (fn.body.type !== 'BlockStatement') return [fn.body];
  const found = [];
  const visit = (node) => {
    if (!node || typeof node.type !== 'string') return;
    if (
      node !== fn &&
      (node.type === 'FunctionExpression' ||
        node.type === 'ArrowFunctionExpression' ||
        node.type === 'FunctionDeclaration')
    ) {
      return;
    }
    if (node.type === 'ReturnStatement') {
      found.push(node.argument ?? { type: 'Identifier', name: 'undefined' });
    }
    for (const key of Object.keys(node)) {
      if (key === 'parent') continue;
      const child = node[key];
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child.type === 'string') visit(child);
    }
  };
  visit(fn.body);
  return found;
}

const isFunction = (node) =>
  node.type === 'ArrowFunctionExpression' || node.type === 'FunctionExpression';

/** `craftComponent(...)` / `craftDirective(...)`, and the object arguments. */
function metaObjectsOf(node) {
  if (
    node.type !== 'CallExpression' ||
    node.callee.type !== 'Identifier' ||
    (node.callee.name !== 'craftComponent' &&
      node.callee.name !== 'craftDirective')
  ) {
    return [];
  }
  return node.arguments.filter(
    (argument) => argument.type === 'ObjectExpression',
  );
}

function propertyNamed(object, name) {
  if (!object || object.type !== 'ObjectExpression') return undefined;
  return object.properties.find(
    (entry) =>
      entry.type === 'Property' &&
      !entry.computed &&
      ((entry.key.type === 'Identifier' && entry.key.name === name) ||
        (entry.key.type === 'Literal' && entry.key.value === name)),
  );
}

module.exports = {
  STYLE_PACKAGE,
  isStyleModule,
  bindingOf,
  rootIdentifier,
  isNullish,
  isFunction,
  returnedExpressions,
  metaObjectsOf,
  propertyNamed,
};
