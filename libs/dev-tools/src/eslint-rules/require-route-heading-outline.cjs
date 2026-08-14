'use strict';

const { parseHyperscriptCall, walk } = require('./hyperscript-walk.cjs');

const ROUTES_FACTORY = 'craftRoutes';

function hasHeadingOutline(node, sourceCode) {
  let found = false;
  walk(node, sourceCode, (candidate) => {
    if (candidate.type !== 'CallExpression' || candidate.callee.type !== 'Identifier') return;
    const name = candidate.callee.name;
    if (name === 'heading' || name === 'headingSection' || name === 'headingRoot') {
      found = true;
      return 'skip';
    }
    const call = parseHyperscriptCall(candidate);
    if (call && (call.tag === 'heading' || call.tag === 'h1')) {
      found = true;
      return 'skip';
    }
  });
  return found;
}

function isLazyImportFactory(node, sourceCode) {
  let found = false;
  walk(node, sourceCode, (candidate) => {
    if (candidate.type === 'ImportExpression') {
      found = true;
      return 'skip';
    }
    if (
      candidate.type === 'CallExpression' &&
      candidate.callee.type === 'Identifier' &&
      candidate.callee.name === 'loadCraftComponent'
    ) {
      found = true;
      return 'skip';
    }
  });
  return found;
}

function loadComponentExpression(routeObject) {
  if (!routeObject || routeObject.type !== 'ObjectExpression') return undefined;
  const load = routeObject.properties.find(
    (entry) =>
      entry.type === 'Property' &&
      !entry.computed &&
      ((entry.key.type === 'Identifier' && entry.key.name === 'loadComponent') ||
        (entry.key.type === 'Literal' && entry.key.value === 'loadComponent')),
  );
  return load?.value;
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require each craftRoutes loadComponent factory to establish a heading outline (heading or headingSection).',
    },
    schema: [],
    messages: {
      missing:
        'Route loadComponent must establish a heading outline: render heading(...) (page title) and headingSection(...) for subsections.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    return {
      CallExpression(node) {
        if (node.callee.type !== 'Identifier' || node.callee.name !== ROUTES_FACTORY) return;
        const routes = node.arguments[1];
        if (!routes || routes.type !== 'ArrayExpression') return;
        for (const element of routes.elements) {
          const load = loadComponentExpression(element);
          if (!load) continue;
          if (hasHeadingOutline(load, sourceCode)) continue;
          if (isLazyImportFactory(load, sourceCode)) continue;
          // Inline factories we can see; imported modules are checked when that file is linted
          // via prefer-relative-heading + this rule on files that inlined the template.
          if (
            load.type === 'ArrowFunctionExpression' ||
            load.type === 'FunctionExpression'
          ) {
            context.report({ node: load, messageId: 'missing' });
          }
        }
      },
    };
  },
};
