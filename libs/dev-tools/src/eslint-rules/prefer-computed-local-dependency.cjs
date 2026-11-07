'use strict';

function isInside(node, ancestor) {
  for (let current = node; current; current = current.parent) {
    if (current === ancestor) return true;
  }
  return false;
}

function enclosingComputed(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (
      current.type === 'CallExpression' &&
      current.callee.type === 'Identifier' &&
      current.callee.name === 'craftComputed'
    ) return current;
  }
  return undefined;
}

function descendants(root, source, visit) {
  for (const key of source.visitorKeys[root.type] ?? []) {
    const value = root[key];
    if (Array.isArray(value)) {
      for (const child of value) if (child?.type) { visit(child); descendants(child, source, visit); }
    } else if (value?.type) { visit(value); descendants(value, source, visit); }
  }
}

module.exports = {
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Yield dependencies inside the craftComputed that exclusively uses them.',
    },
    schema: [],
    messages: {
      local: 'This yielded dependency is only used inside this craftComputed. Yield it in a generator callback there so the computed owns its dependency directly.',
    },
  },
  create(context) {
    const queryFactoryNames = new Set(['query']);
    return {
      ImportDeclaration(node) {
        if (node.source.value !== '@craft-ts/core') return;
        for (const specifier of node.specifiers) {
          if (
            specifier.type === 'ImportSpecifier' &&
            (specifier.imported.name ?? specifier.imported.value) === 'query'
          ) queryFactoryNames.add(specifier.local.name);
        }
      },
      'Program:exit'() {
        descendants(context.sourceCode.ast, context.sourceCode, (candidate) => {
          if (candidate.type !== 'VariableDeclarator') return;
          const node = candidate;
        if (
          node.id.type !== 'Identifier' ||
          node.init?.type !== 'YieldExpression' ||
          !node.init.delegate
        ) return;
        // A query is a named service resource. Its loading/value reader may
        // be consumed by one computed in this file while its call/mutate API
        // remains part of the owning service for other consumers.
        // craftPrivate(query(...)) is the same resource, kept out of the API.
        const yielded = node.init.argument;
        const dependency =
          yielded?.type === 'CallExpression' &&
          yielded.callee.type === 'Identifier' &&
          yielded.callee.name === 'craftPrivate' &&
          yielded.arguments[0]?.type === 'CallExpression'
            ? yielded.arguments[0]
            : yielded;
        if (
          dependency?.type === 'CallExpression' &&
          dependency.callee.type === 'Identifier' &&
          queryFactoryNames.has(dependency.callee.name)
        ) return;
        // Any named primitive (`state('x', …)`, `mutation('x', …)`,
        // `craftComputed('x', …)`…) is declared by this entity, not resolved
        // from elsewhere: moved into a computed it would be recreated on every
        // recomputation. Only resolved dependencies belong to the computed.
        if (
          dependency?.type === 'CallExpression' &&
          dependency.arguments[0]?.type === 'Literal' &&
          typeof dependency.arguments[0].value === 'string'
        ) return;
        const variable = context.sourceCode.getDeclaredVariables(node)[0];
        if (!variable) return;
        const references = variable.references.filter((reference) => reference.identifier !== node.id);
        if (references.length === 0) return;
        const computed = references.map((reference) => enclosingComputed(reference.identifier));
        if (!computed[0] || computed.some((item) => item !== computed[0])) return;
        const callback = computed[0].arguments.find((argument) =>
          argument.type === 'FunctionExpression' || argument.type === 'ArrowFunctionExpression',
        );
        if (callback && isInside(node, callback)) return;
        if (!callback || !references.every((reference) => isInside(reference.identifier, callback))) return;
        context.report({ node: node.init, messageId: 'local' });
        });
      }
    };
  },
};
