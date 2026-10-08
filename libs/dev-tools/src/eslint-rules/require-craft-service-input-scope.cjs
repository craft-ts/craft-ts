const CORE_MODULE = '@craft-ts/core';
const SERVICE_MODULE = /(?:^|\/)craft-service(?:\.ts)?$/;

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require craftService factory inputs to match the instance scope.',
    },
    schema: [],
    messages: {
      global:
        'A global craftService is a singleton and cannot declare factory inputs. Use `providedIn: "function"` for call-site inputs, or a provider scope with only `$provided` for instance configuration.',
      function:
        'A function craftService has no provider. Declare every value as a call-site input and pass it to `X(...)`; `$provided` is only for provider-scoped services.',
      provider:
        'A {{scope}} craftService can only declare `$provided` factory inputs. Pass instance configuration through its generated provider, using withComponentProviders when it comes from component inputs.',
    },
  },
  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();

    return {
      CallExpression(node) {
        if (!isCraftService(node.callee, sourceCode)) return;

        const scope = providedIn(node.arguments[0]);
        const factory = unwrap(node.arguments[1]);
        if (
          !scope ||
          ![
            'global',
            'toProvide',
            'manuallyProvidedAtRoot',
            'function',
          ].includes(scope) ||
          !isFunction(factory)
        ) {
          return;
        }

        const parameter = factory.params[0];
        if (!parameter) return;

        const shape = inputShape(parameter, sourceCode);
        const hasProvided = shape
          ? shape.keys.includes('$provided') || shape.hasIndex
          : true;
        const hasPublic = shape
          ? shape.keys.some((key) => key !== '$provided') || shape.hasIndex
          : true;

        if (scope === 'global' && (hasPublic || hasProvided)) {
          context.report({ node: parameter, messageId: 'global' });
          return;
        }

        if (scope === 'function' && hasProvided) {
          context.report({ node: parameter, messageId: 'function' });
          return;
        }

        if (
          (scope === 'toProvide' || scope === 'manuallyProvidedAtRoot') &&
          hasPublic
        ) {
          context.report({
            node: parameter,
            messageId: 'provider',
            data: { scope },
          });
          return;
        }
      },
    };
  },
};

function providedIn(rawOptions) {
  const options = unwrap(rawOptions);
  if (options?.type !== 'ObjectExpression') return undefined;
  const property = options.properties.find(
    (candidate) =>
      candidate.type === 'Property' &&
      !candidate.computed &&
      propertyName(candidate.key) === 'providedIn',
  );
  return property?.value?.type === 'Literal' &&
    typeof property.value.value === 'string'
    ? property.value.value
    : undefined;
}

function inputShape(parameter, sourceCode) {
  const services = sourceCode.parserServices;
  const program = services?.program;
  const map = services?.esTreeNodeToTSNodeMap;
  if (program && map?.has(parameter)) {
    try {
      const checker = program.getTypeChecker();
      const type = checker.getTypeAtLocation(map.get(parameter));
      if (checker.typeToString(type) === 'any') {
        // `any` can hide arbitrary public inputs. Treat it conservatively so
        // a typed lint run cannot silently bypass the scope invariant.
        return { keys: [], hasIndex: true };
      }
      const keys = checker.getPropertiesOfType(type).map(({ name }) => name);
      return { keys, hasIndex: !!checker.getStringIndexType?.(type) };
    } catch {
      // Fall back to the annotation syntax when the parser's program cannot
      // resolve a type (for example, while linting an isolated snippet).
    }
  }

  const annotation = parameter.typeAnnotation?.typeAnnotation;
  const declarations = localTypeDeclarations(sourceCode.ast);
  return annotation ? typeKeys(annotation, declarations, new Set()) : undefined;
}

function typeKeys(typeNode, declarations, seen) {
  const type = unwrap(typeNode);
  if (!type) return undefined;

  if (type.type === 'TSTypeLiteral') {
    const keys = [];
    for (const member of type.members) {
      if (member.type !== 'TSPropertySignature') return undefined;
      const key = propertyName(member.key);
      if (key === undefined) return undefined;
      keys.push(key);
    }
    return { keys, hasIndex: false };
  }

  if (type.type === 'TSInterfaceBody') {
    return typeKeys(
      { type: 'TSTypeLiteral', members: type.body },
      declarations,
      seen,
    );
  }

  if (type.type === 'TSIntersectionType' || type.type === 'TSUnionType') {
    const shapes = type.types.map((part) => typeKeys(part, declarations, seen));
    if (shapes.some((shape) => !shape)) return undefined;
    return {
      keys: [...new Set(shapes.flatMap((shape) => shape.keys))],
      hasIndex: shapes.some((shape) => shape.hasIndex),
    };
  }

  if (type.type === 'TSTypeReference' && type.typeName.type === 'Identifier') {
    const name = type.typeName.name;
    const declaration = declarations.get(name);
    if (!declaration || seen.has(name)) return undefined;
    const nextSeen = new Set(seen).add(name);
    return declaration.type === 'TSInterfaceDeclaration'
      ? typeKeys(declaration.body, declarations, nextSeen)
      : typeKeys(declaration.typeAnnotation, declarations, nextSeen);
  }

  return undefined;
}

function localTypeDeclarations(program) {
  const declarations = new Map();
  for (const statement of program.body ?? []) {
    if (
      statement.type === 'TSTypeAliasDeclaration' ||
      statement.type === 'TSInterfaceDeclaration'
    ) {
      declarations.set(statement.id.name, statement);
    }
  }
  return declarations;
}

function isFunction(node) {
  return (
    node?.type === 'FunctionExpression' ||
    node?.type === 'ArrowFunctionExpression' ||
    node?.type === 'FunctionDeclaration'
  );
}

function isCraftService(callee, sourceCode) {
  const node = unwrap(callee);
  if (node?.type === 'Identifier') {
    return importedBinding(node, sourceCode, 'ImportSpecifier');
  }
  return (
    node?.type === 'MemberExpression' &&
    !node.computed &&
    node.object.type === 'Identifier' &&
    propertyName(node.property) === 'craftService' &&
    importedBinding(node.object, sourceCode, 'ImportNamespaceSpecifier')
  );
}

function importedBinding(identifier, sourceCode, importKind) {
  let scope = sourceCode.getScope(identifier);
  while (scope) {
    const variable = scope.set.get(identifier.name);
    if (variable) {
      return variable.defs.some((definition) => {
        if (
          definition.type !== 'ImportBinding' ||
          definition.node.type !== importKind
        ) {
          return false;
        }
        const declaration = definition.parent;
        const moduleName = declaration?.source?.value;
        const imported =
          definition.node.imported?.name ?? definition.node.imported?.value;
        return (
          (moduleName === CORE_MODULE ||
            SERVICE_MODULE.test(moduleName ?? '')) &&
          (importKind === 'ImportNamespaceSpecifier' ||
            imported === 'craftService')
        );
      });
    }
    scope = scope.upper;
  }
  return false;
}

function propertyName(node) {
  if (node?.type === 'Identifier') return node.name;
  if (node?.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  return undefined;
}

function unwrap(node) {
  let current = node;
  while (
    current &&
    [
      'TSAsExpression',
      'TSTypeAssertion',
      'TSNonNullExpression',
      'TSSatisfiesExpression',
      'ParenthesizedExpression',
    ].includes(current.type)
  ) {
    current = current.expression;
  }
  return current;
}
