'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { walk } = require('./hyperscript-walk.cjs');

const ROUTES_FACTORY = 'craftRoutes';
const HEADING_CALL = /\bheading\s*\(/;

function propertyName(property) {
  if (!property || property.computed) return undefined;
  if (property.key.type === 'Identifier') return property.key.name;
  if (property.key.type === 'Literal') return property.key.value;
  return undefined;
}

function isCallNamed(node, name) {
  return (
    !!node &&
    node.type === 'CallExpression' &&
    node.callee.type === 'Identifier' &&
    node.callee.name === name
  );
}

function hasHeadingCall(node, sourceCode) {
  let found = false;
  walk(node, sourceCode, (candidate) => {
    if (isCallNamed(candidate, 'heading')) {
      found = true;
      return 'skip';
    }
  });
  return found;
}

function collectImportSpecifiers(node, sourceCode) {
  const specifiers = [];
  walk(node, sourceCode, (candidate) => {
    if (candidate.type !== 'ImportExpression') return;
    const source = candidate.source;
    if (source.type === 'Literal' && typeof source.value === 'string') {
      specifiers.push(source.value);
      return;
    }
    if (
      source.type === 'TemplateLiteral' &&
      source.expressions.length === 0 &&
      source.quasis.length === 1
    ) {
      specifiers.push(source.quasis[0].value.cooked);
    }
  });
  return specifiers;
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function resolveImportedFile(fromFile, specifier) {
  if (!fromFile || !specifier || !specifier.startsWith('.')) return undefined;
  if (!fileExists(fromFile)) return undefined;
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
  ];
  return candidates.find((candidate) => fileExists(candidate));
}

function fileHasHeading(filePath) {
  try {
    return HEADING_CALL.test(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return false;
  }
}

function checkLoadFactory(context, sourceCode, factory, reportNode) {
  if (!factory) return;
  const specifiers = collectImportSpecifiers(factory, sourceCode);
  if (specifiers.length > 0) {
    const filename = context.filename ?? context.getFilename?.() ?? '';
    for (const specifier of specifiers) {
      const resolved = resolveImportedFile(filename, specifier);
      if (!resolved) continue;
      if (!fileHasHeading(resolved)) {
        context.report({ node: reportNode, messageId: 'missing' });
        return;
      }
    }
    return;
  }
  if (hasHeadingCall(factory, sourceCode)) return;
  if (
    factory.type === 'ArrowFunctionExpression' ||
    factory.type === 'FunctionExpression'
  ) {
    context.report({ node: reportNode, messageId: 'missing' });
  }
}

function visitRouteConfig(context, sourceCode, node) {
  if (!node) return;
  if (node.type === 'ArrayExpression') {
    for (const element of node.elements) {
      visitRouteConfig(context, sourceCode, element);
    }
    return;
  }
  if (isCallNamed(node, 'craftRoute')) {
    visitRouteConfig(context, sourceCode, node.arguments[1]);
    return;
  }
  if (isCallNamed(node, 'loadCraftComponent')) {
    checkLoadFactory(context, sourceCode, node.arguments[0], node);
    return;
  }
  if (node.type !== 'ObjectExpression') return;
  for (const prop of node.properties) {
    if (prop.type === 'SpreadElement') {
      visitRouteConfig(context, sourceCode, prop.argument);
      continue;
    }
    if (prop.type !== 'Property') continue;
    const name = propertyName(prop);
    if (name === 'loadComponent') {
      checkLoadFactory(context, sourceCode, prop.value, prop.value);
    } else if (name === 'children') {
      visitRouteConfig(context, sourceCode, prop.value);
    }
  }
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require each craftRoutes loadComponent SFC to call heading() (not headingRoot). Layouts wrap the outlet in headingSection; shells do not put heading() above the outlet.',
    },
    schema: [],
    messages: {
      missing:
        'Route loadComponent must call heading(...). Layouts wrap CraftRouterOutlet in headingSection(...); shells must not put heading() above the outlet.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    return {
      CallExpression(node) {
        if (!isCallNamed(node, ROUTES_FACTORY)) return;
        visitRouteConfig(context, sourceCode, node.arguments[1]);
      },
    };
  },
};
