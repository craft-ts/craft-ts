'use strict';

// Parent-side companion to `.withParent<ParentRoutes<'path'>>()`.
//
// A `craftRoutes(...)` collection that mounts lazy children via
// `loadChildren: () => import('./x').then((m) => m.xRoutes)` must be checked once
// with `assertChildRouteMounts(xRoutes)`, so a `.withParent`-pinned child mounted
// under the wrong route path becomes a compile error. This rule reports the
// missing assert and, on `--fix`, inserts the call plus its import.
//
// Everything it needs lives in the same file (the collection binding), so the fix
// is fully derivable and applied with surgical native-AST text insertions.

const ROUTES_FACTORY = 'craftRoutes';
const ASSERT_FN = 'assertChildRouteMounts';
const CRAFT_MODULE = '@craft-ts/core';

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Ensure every craftRoutes collection mounting lazy loadChildren is checked with assertChildRouteMounts(...).',
    },
    fixable: 'code',
    schema: [],
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    const routesCalls = [];
    const assertedArgs = new Set();
    let craftImport = null;

    return {
      ImportDeclaration(node) {
        if (
          node.source.value === CRAFT_MODULE &&
          node.importKind !== 'type' &&
          !craftImport
        ) {
          craftImport = node;
        }
      },
      CallExpression(node) {
        if (node.callee.type !== 'Identifier') {
          return;
        }
        if (node.callee.name === ROUTES_FACTORY) {
          routesCalls.push(node);
        } else if (node.callee.name === ASSERT_FN) {
          const arg = node.arguments[0];
          if (arg && arg.type === 'Identifier') {
            assertedArgs.add(arg.name);
          }
        }
      },
      'Program:exit'() {
        const fixes = [];
        const missing = [];

        for (const call of routesCalls) {
          const collectionName = stringArg(call, 0);
          const routesArray = call.arguments[1];
          if (
            collectionName === undefined ||
            !routesArray ||
            routesArray.type !== 'ArrayExpression'
          ) {
            continue;
          }

          if (!routesArray.elements.some(hasLazyLoadChildren)) {
            continue;
          }

          const binding = resolveBindingName(call, collectionName);
          if (!binding || assertedArgs.has(binding)) {
            continue;
          }

          const statement = enclosingStatement(call);
          if (!statement) {
            continue;
          }

          fixes.push((fixer) =>
            fixer.insertTextAfter(statement, `\n\n${ASSERT_FN}(${binding});`),
          );
          missing.push({ node: call, binding });
        }

        if (missing.length === 0) {
          return;
        }

        if (!isAssertImported(craftImport)) {
          fixes.push((fixer) => addAssertImport(fixer, sourceCode, craftImport));
        }

        context.report({
          loc: missing[0].node.loc,
          message: `craftRoutes collection(s) mounting lazy loadChildren must be checked with ${ASSERT_FN}(): ${missing
            .map((m) => m.binding)
            .join(', ')}`,
          fix(fixer) {
            return fixes.map((makeFix) => makeFix(fixer)).filter(Boolean);
          },
        });
      },
    };
  },
};

// `{ …, loadChildren: () => import('./x').then((m) => m.xRoutes) }`
function hasLazyLoadChildren(element) {
  if (!element || element.type !== 'ObjectExpression') {
    return false;
  }
  const loadChildren = findProperty(element, 'loadChildren');
  return Boolean(loadChildren) && loadChildren.value.type === 'ArrowFunctionExpression';
}

function findProperty(objectExpression, name) {
  return objectExpression.properties.find(
    (property) =>
      property.type === 'Property' &&
      !property.computed &&
      ((property.key.type === 'Identifier' && property.key.name === name) ||
        (property.key.type === 'Literal' && property.key.value === name)),
  );
}

function stringArg(call, index) {
  const arg = call.arguments[index];
  return arg && arg.type === 'Literal' && typeof arg.value === 'string'
    ? arg.value
    : undefined;
}

// The collection is destructured as `const { <name>Routes, inject... } = craftRoutes(...)`.
function resolveBindingName(call, collectionName) {
  const declarator = enclosingDeclarator(call);
  if (!declarator || declarator.id.type !== 'ObjectPattern') {
    return undefined;
  }
  const properties = declarator.id.properties.filter(
    (property) => property.type === 'Property' && property.key.type === 'Identifier',
  );

  const expected = `${collectionName}Routes`;
  const exact = properties.find((property) => property.key.name === expected);
  if (exact && exact.value.type === 'Identifier') {
    return exact.value.name;
  }

  const endingInRoutes = properties.filter((property) =>
    property.key.name.endsWith('Routes'),
  );
  return endingInRoutes.length === 1 && endingInRoutes[0].value.type === 'Identifier'
    ? endingInRoutes[0].value.name
    : undefined;
}

function enclosingDeclarator(node) {
  let current = node.parent;
  while (current) {
    if (current.type === 'VariableDeclarator') {
      return current;
    }
    if (current.type === 'Program' || current.type === 'BlockStatement') {
      return undefined;
    }
    current = current.parent;
  }
  return undefined;
}

// The top-level statement to append the assert after.
function enclosingStatement(node) {
  let current = node.parent;
  while (current) {
    if (
      current.type === 'VariableDeclaration' &&
      current.parent &&
      (current.parent.type === 'Program' ||
        current.parent.type === 'ExportNamedDeclaration')
    ) {
      return current.parent.type === 'ExportNamedDeclaration'
        ? current.parent
        : current;
    }
    current = current.parent;
  }
  return undefined;
}

function isAssertImported(craftImport) {
  if (!craftImport) {
    return false;
  }
  return craftImport.specifiers.some(
    (specifier) =>
      specifier.type === 'ImportSpecifier' &&
      specifier.imported.name === ASSERT_FN,
  );
}

function addAssertImport(fixer, sourceCode, craftImport) {
  if (craftImport) {
    const brace = sourceCode.getFirstToken(
      craftImport,
      (token) => token.value === '{',
    );
    if (brace) {
      return fixer.insertTextAfter(brace, `\n  ${ASSERT_FN},`);
    }
  }
  // No mergeable value import — add a fresh one at the top of the file.
  return fixer.insertTextBeforeRange(
    [0, 0],
    `import { ${ASSERT_FN} } from '${CRAFT_MODULE}';\n`,
  );
}
