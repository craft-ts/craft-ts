const ruleName = 'component-test-gen-deps-match';

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Ensure setupCraftComponentTestingByRegister uses the GenDeps alias matching the tested component.',
    },
    fixable: null,
    schema: [],
    messages: {
      mismatch:
        'setupCraftComponentTestingByRegister({{ component }}, ...) must use {{ expected }}.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const helperNames = new Set();
    const namespaceNames = new Set();

    return {
      ImportDeclaration(node) {
        if (node.source.value !== '@craft-ng/core') {
          return;
        }

        for (const specifier of node.specifiers) {
          if (
            specifier.type === 'ImportSpecifier' &&
            getImportedName(specifier) ===
              'setupCraftComponentTestingByRegister'
          ) {
            helperNames.add(specifier.local.name);
          }

          if (specifier.type === 'ImportNamespaceSpecifier') {
            namespaceNames.add(specifier.local.name);
          }
        }
      },
      CallExpression(node) {
        if (!isHelperCall(node.callee, helperNames, namespaceNames)) {
          return;
        }

        const [componentArgument, depsArgument] = node.arguments;
        const componentName = getIdentifierName(componentArgument);

        if (!componentName || !depsArgument) {
          return;
        }

        const expected = `GenDeps_${componentName}`;
        const actual = getGenDepsName(sourceCode.getText(depsArgument));

        if (actual === expected) {
          return;
        }

        context.report({
          node: depsArgument,
          messageId: 'mismatch',
          data: {
            component: componentName,
            expected,
          },
        });
      },
    };
  },
};

function isHelperCall(callee, helperNames, namespaceNames) {
  if (!callee) {
    return false;
  }

  if (callee.type === 'Identifier') {
    return helperNames.has(callee.name);
  }

  if (
    callee.type === 'MemberExpression' &&
    !callee.computed &&
    callee.object.type === 'Identifier' &&
    namespaceNames.has(callee.object.name) &&
    callee.property.type === 'Identifier'
  ) {
    return callee.property.name === 'setupCraftComponentTestingByRegister';
  }

  return false;
}

function getImportedName(specifier) {
  const imported = specifier.imported;

  if (imported.type === 'Identifier') {
    return imported.name;
  }

  if (imported.type === 'Literal') {
    return imported.value;
  }

  return undefined;
}

function getIdentifierName(node) {
  return node?.type === 'Identifier' ? node.name : undefined;
}

function getGenDepsName(text) {
  const matches = [...text.matchAll(/\bGenDeps_[A-Za-z_$][A-Za-z0-9_$]*/g)];
  return matches.at(-1)?.[0];
}

module.exports.ruleName = ruleName;
