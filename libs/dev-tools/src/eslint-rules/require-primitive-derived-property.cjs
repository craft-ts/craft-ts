const PRIMITIVES = new Set([
  'asyncProcess',
  'mutation',
  'query',
  'queryParams',
  'state',
]);

const HOSTS = new Set(['craftComponent', 'craftService', 'toCraftService']);

const PIPE_BY_PRIMITIVE = {
  asyncProcess: 'insertAsyncProcessPipe',
  mutation: 'insertMutationPipe',
  query: 'insertQueryPipe',
  queryParams: 'insertQueryParamsPipe',
  state: 'insertStatePipe',
};

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require values derived from one local Craft primitive to be declared as an insertion on that primitive.',
    },
    fixable: 'code',
    schema: [],
    messages: {
      deriveOnPrimitive:
        "'{{name}}' only depends on the '{{primitive}}' primitive in the same Craft entity. Define it in that primitive's insertion instead of creating a separate computed.",
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    return {
      CallExpression(node) {
        const computedCall = getComputedCall(node, sourceCode);
        if (!computedCall || isInsidePrimitive(node, sourceCode)) {
          return;
        }

        const entity = findEntityFor(node);
        if (!entity) {
          return;
        }

        const computation = getComputationFunction(node, computedCall);
        if (!computation || computation.generator) {
          return;
        }

        const dependencies = findPrimitiveDependencies(
          computation,
          sourceCode,
          entity,
        );
        if (dependencies.size !== 1) {
          return;
        }

        const [dependency] = dependencies.values();
        const declaredName = getDeclaredName(node);
        if (!declaredName) {
          return;
        }

        const fix = createFix({
          sourceCode,
          computedCall: node,
          computedName: declaredName,
          computation,
          dependency,
        });

        context.report({
          node,
          messageId: 'deriveOnPrimitive',
          data: {
            name: declaredName,
            primitive: dependency.name,
          },
          ...(fix ? { fix } : {}),
        });
      },
    };
  },
};

function getComputedCall(node, sourceCode) {
  if (node.callee.type !== 'Identifier') {
    return undefined;
  }

  if (
    node.callee.name === 'computed' &&
    resolvesToImport(node.callee, '@angular/core', 'computed', sourceCode)
  ) {
    return 'computed';
  }

  if (
    node.callee.name === 'craftComputed' &&
    resolvesToImport(node.callee, '@craft-ts/core', 'craftComputed', sourceCode)
  ) {
    return 'craftComputed';
  }

  return undefined;
}

function getComputationFunction(node, computedKind) {
  if (computedKind === 'computed') {
    return isFunction(node.arguments[0]) ? node.arguments[0] : undefined;
  }

  // `craftComputed(name, host, computation)` is host-bound. Moving its
  // computation would change the `this` value, so leave that case for a
  // human refactor. The normal form is `craftComputed(name, computation)`.
  if (node.arguments.length !== 2) {
    return undefined;
  }

  return isFunction(node.arguments[1]) ? node.arguments[1] : undefined;
}

function findPrimitiveDependencies(computation, sourceCode, entity) {
  const dependencies = new Map();

  walk(computation, sourceCode, (child) => {
    if (child.type !== 'Identifier' || isNonReferenceIdentifier(child)) {
      return;
    }

    const variable = findVariable(child, sourceCode);
    const primitive = variable && getPrimitiveDeclaration(variable, sourceCode);
    if (!primitive || findEntityFor(primitive.declaration) !== entity) {
      return;
    }

    dependencies.set(variable, {
      ...primitive,
      name: child.name,
      reference: child,
      replaceable: isReplaceableReference(child),
    });
  });

  return dependencies;
}

function getPrimitiveDeclaration(variable, sourceCode) {
  for (const definition of variable.defs ?? []) {
    if (definition.type !== 'Variable' || !definition.node) {
      continue;
    }

    const declarator = definition.node;
    if (declarator.id.type !== 'Identifier') {
      continue;
    }

    const call = getPrimitiveCall(declarator.init, sourceCode);
    if (call) {
      return {
        declaration: declarator,
        call,
        primitive: call.primitive,
      };
    }
  }

  return undefined;
}

function getPrimitiveCall(node, sourceCode) {
  let current = unwrap(node);
  if (current && current.type === 'YieldExpression') {
    current = unwrap(current.argument);
  }

  if (!current || current.type !== 'CallExpression') {
    return undefined;
  }

  if (current.callee.type !== 'Identifier') {
    return undefined;
  }

  const primitive = getImportedName(
    current.callee,
    '@craft-ts/core',
    sourceCode,
  );
  if (!primitive || !PRIMITIVES.has(primitive)) {
    return undefined;
  }

  return { node: current, primitive };
}

function createFix({
  sourceCode,
  computedCall,
  computedName,
  computation,
  dependency,
}) {
  const declaration = getDeclarationParent(computedCall);
  const declarationStatement = declaration && declaration.parent;
  if (
    !declaration ||
    !declarationStatement ||
    declarationStatement.type !== 'VariableDeclaration' ||
    declarationStatement.declarations.length !== 1 ||
    declaration.type !== 'VariableDeclarator' ||
    declaration.id.type !== 'Identifier' ||
    !dependency.replaceable
  ) {
    return undefined;
  }

  const rewrittenComputation = rewriteComputation(
    computation,
    dependency,
    sourceCode,
  );
  if (!rewrittenComputation) {
    return undefined;
  }

  const primitiveCall = dependency.call.node;
  const primitiveName = dependency.primitive;
  const insertion = `({ state }) => ({ ${computedName}: computed(${rewrittenComputation}) })`;
  return (fixer) => {
    const primitiveFix = createPrimitiveInsertionFix(
      fixer,
      sourceCode,
      primitiveCall,
      primitiveName,
      insertion,
    );
    const fixes = [
      ...(Array.isArray(primitiveFix) ? primitiveFix : [primitiveFix]),
      fixer.replaceText(
        declarationStatement,
        `${declarationStatement.kind} ${declaration.id.name} = ${dependency.name}.${computedName};`,
      ),
    ];

    const computedImportFix = createNamedImportFix(
      fixer,
      sourceCode,
      '@angular/core',
      'computed',
    );
    if (computedImportFix) {
      fixes.push(computedImportFix);
    }
    return fixes;
  };
}

function createPrimitiveInsertionFix(
  fixer,
  sourceCode,
  primitiveCall,
  primitiveName,
  insertion,
) {
  const existing = primitiveCall.arguments[2];
  if (!existing) {
    const lastArgument =
      primitiveCall.arguments[primitiveCall.arguments.length - 1];
    return fixer.insertTextAfter(lastArgument, `, ${insertion}`);
  }

  const pipeName = PIPE_BY_PRIMITIVE[primitiveName];
  const existingPipe = getImportedName(
    existing.callee,
    '@craft-ts/core',
    sourceCode,
  );
  if (
    existing.type === 'CallExpression' &&
    existing.callee.type === 'Identifier' &&
    existingPipe === pipeName
  ) {
    const closeParen = sourceCode.getLastToken(existing);
    return fixer.insertTextBefore(closeParen, `, ${insertion}`);
  }

  const pipeImportFix = createNamedImportFix(
    fixer,
    sourceCode,
    '@craft-ts/core',
    pipeName,
  );
  const existingText = sourceCode.getText(existing);
  const fixes = [
    fixer.replaceText(existing, `${pipeName}(${existingText}, ${insertion})`),
  ];
  if (pipeImportFix) {
    fixes.push(pipeImportFix);
  }
  return fixes;
}

function rewriteComputation(computation, dependency, sourceCode) {
  const replacements = [];
  walk(computation, sourceCode, (node) => {
    if (
      node.type !== 'Identifier' ||
      node.name !== dependency.name ||
      isNonReferenceIdentifier(node)
    ) {
      return;
    }

    const variable = findVariable(node, sourceCode);
    if (!variable || !getPrimitiveDeclaration(variable, sourceCode)) {
      return;
    }

    const parent = node.parent;
    if (
      parent &&
      parent.type === 'MemberExpression' &&
      parent.object === node &&
      !parent.computed &&
      parent.property.type === 'Identifier' &&
      (parent.property.name === 'value' || parent.property.name === 'state')
    ) {
      replacements.push({ node: parent, text: 'state' });
      return;
    }

    if (parent && parent.type === 'CallExpression' && parent.callee === node) {
      replacements.push({ node, text: 'state' });
      return;
    }

    // A bare resource object, a dynamic property access, or another resource
    // method cannot be translated to the insertion context without guessing.
    replacements.push({ node: null });
  });

  if (replacements.some((replacement) => !replacement.node)) {
    return undefined;
  }

  let result = sourceCode.getText(computation);
  const start = computation.range[0];
  for (const replacement of replacements.sort(
    (a, b) => b.node.range[0] - a.node.range[0],
  )) {
    const offsetStart = replacement.node.range[0] - start;
    const offsetEnd = replacement.node.range[1] - start;
    result =
      result.slice(0, offsetStart) + replacement.text + result.slice(offsetEnd);
  }
  return result;
}

function findEntityFor(node) {
  let current = node;
  while (current) {
    if (isFunction(current)) {
      const parent = current.parent;
      if (
        parent &&
        parent.type === 'CallExpression' &&
        parent.callee.type === 'Identifier' &&
        isEntityFactory(parent.callee.name, parent, current)
      ) {
        return parent;
      }
    }
    current = current.parent;
  }
  return undefined;
}

function isEntityFactory(name, call, fn) {
  if (!HOSTS.has(name)) {
    return false;
  }
  if (name === 'craftComponent') {
    return call.arguments[2] === fn;
  }
  return call.arguments.slice(1).includes(fn);
}

function isInsidePrimitive(node, sourceCode) {
  let current = node.parent;
  while (current) {
    if (
      current.type === 'CallExpression' &&
      current.callee.type === 'Identifier' &&
      PRIMITIVES.has(
        getImportedName(current.callee, '@craft-ts/core', sourceCode),
      )
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function getDeclaredName(node) {
  const parent = getDeclarationParent(node);
  if (
    parent &&
    parent.type === 'VariableDeclarator' &&
    unwrapYield(parent.init) === node &&
    parent.id.type === 'Identifier'
  ) {
    return parent.id.name;
  }
  return undefined;
}

function getDeclarationParent(node) {
  let current = node.parent;
  if (current?.type === 'YieldExpression' && current.argument === node) {
    current = current.parent;
  }
  return current;
}

function unwrapYield(node) {
  return node?.type === 'YieldExpression' ? node.argument : node;
}

function isReplaceableReference(node) {
  const parent = node.parent;
  if (!parent) return false;
  if (
    parent.type === 'MemberExpression' &&
    parent.object === node &&
    !parent.computed &&
    parent.property.type === 'Identifier' &&
    (parent.property.name === 'value' || parent.property.name === 'state')
  ) {
    return true;
  }
  return parent.type === 'CallExpression' && parent.callee === node;
}

function isNonReferenceIdentifier(node) {
  const parent = node.parent;
  if (!parent) return false;
  if (
    (parent.type === 'MemberExpression' &&
      parent.property === node &&
      !parent.computed) ||
    (parent.type === 'Property' &&
      parent.key === node &&
      !parent.computed &&
      parent.value !== node) ||
    (parent.type === 'MethodDefinition' && parent.key === node) ||
    (parent.type === 'VariableDeclarator' && parent.id === node) ||
    (parent.type === 'FunctionDeclaration' && parent.id === node) ||
    (parent.type === 'FunctionExpression' && parent.id === node) ||
    (parent.type === 'ClassDeclaration' && parent.id === node) ||
    (parent.type === 'ClassExpression' && parent.id === node) ||
    (parent.type === 'LabeledStatement' && parent.label === node) ||
    (parent.type === 'BreakStatement' && parent.label === node) ||
    (parent.type === 'ContinueStatement' && parent.label === node)
  ) {
    return true;
  }
  return false;
}

function findVariable(identifier, sourceCode) {
  let scope = sourceCode.getScope(identifier);
  while (scope) {
    const variable = scope.set?.get(identifier.name);
    if (variable) return variable;
    scope = scope.upper;
  }
  return undefined;
}

function resolvesToImport(identifier, source, importedName, sourceCode) {
  return getImportedName(identifier, source, sourceCode) === importedName;
}

function getImportedName(identifier, source, sourceCode) {
  if (!identifier || identifier.type !== 'Identifier') return undefined;
  const variable = findVariable(identifier, sourceCode);
  for (const definition of variable?.defs ?? []) {
    if (
      definition.type === 'ImportBinding' &&
      definition.parent?.source?.value === source
    ) {
      if (definition.node.type !== 'ImportSpecifier') {
        return definition.node.local.name;
      }
      return definition.node.imported.type === 'Identifier'
        ? definition.node.imported.name
        : definition.node.imported.value;
    }
  }
  return undefined;
}

function createNamedImportFix(fixer, sourceCode, source, name) {
  const imports = sourceCode.ast.body.filter(
    (statement) =>
      statement.type === 'ImportDeclaration' &&
      statement.source.value === source,
  );
  const importDeclaration = imports[0];
  if (
    imports.some((statement) =>
      statement.specifiers.some(
        (specifier) =>
          specifier.type === 'ImportSpecifier' &&
          specifier.imported.type === 'Identifier' &&
          specifier.imported.name === name,
      ),
    )
  ) {
    return undefined;
  }

  if (!importDeclaration) {
    return fixer.insertTextBefore(
      sourceCode.ast.body[0] ?? sourceCode.ast,
      `import { ${name} } from '${source}';\n`,
    );
  }

  const named = importDeclaration.specifiers.filter(
    (specifier) => specifier.type === 'ImportSpecifier',
  );
  if (named.length === 0) return undefined;
  return fixer.insertTextAfter(named[named.length - 1], `, ${name}`);
}

function walk(node, sourceCode, visitor) {
  visitor(node);
  const keys = sourceCode.visitorKeys?.[node.type] ?? [];
  for (const key of keys) {
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item.type === 'string') {
          walk(item, sourceCode, visitor);
        }
      }
    } else if (child && typeof child.type === 'string') {
      walk(child, sourceCode, visitor);
    }
  }
}

function unwrap(node) {
  let current = node;
  while (
    current &&
    (current.type === 'ChainExpression' ||
      current.type === 'TSAsExpression' ||
      current.type === 'TSTypeAssertion' ||
      current.type === 'ParenthesizedExpression')
  ) {
    current = current.expression;
  }
  return current;
}

function isFunction(node) {
  return (
    node &&
    (node.type === 'ArrowFunctionExpression' ||
      node.type === 'FunctionExpression' ||
      node.type === 'FunctionDeclaration')
  );
}
