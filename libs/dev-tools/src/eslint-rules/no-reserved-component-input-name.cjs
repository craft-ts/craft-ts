'use strict';

const { hostPropertyKind } = require('./component-host-properties.cjs');

const COMPONENT_MODULE = '@craft-ts/component';

const REASONS = {
  property: 'a DOM property of the root element',
  attribute: 'a DOM attribute of the root element',
  event: 'a DOM event listener of the root element',
};

/**
 * A component call sends some keys to its root element instead of the
 * component: global DOM properties (`title`, `id`, `slot`…), `data-*` and
 * `aria-*` attributes, and DOM events (`error`, `input`, `onClick`…). An input
 * declared with one of these names type-checks but never reaches the component.
 * The rule looks at the declaration — the inputs of the component factory —
 * never at the keys a caller passes, which may legitimately target the root
 * element.
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow craftComponent inputs named like a DOM property, attribute or event that a component call forwards to its root element.',
    },
    schema: [],
    messages: {
      reserved:
        'The input `{{name}}`{{component}} never reaches the component: at a component call, `{{name}}` is reserved for {{reason}}. Rename the input to a component-specific name, for example `{{suggestion}}`; callers can still pass `{{name}}` to set it on the root element.',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    // A type shared by several components is reported once, where it is declared.
    const reportedDeclarations = new Set();

    return {
      CallExpression(node) {
        if (!isCraftComponent(node.callee, sourceCode)) return;

        const factory = unwrap(node.arguments[2]);
        if (!isFunction(factory)) return;
        const parameter = factory.params[0];
        if (!parameter) return;

        const componentName = staticString(node.arguments[0]);
        const reported = new Set();
        for (const input of declaredInputs(parameter, sourceCode)) {
          if (reported.has(input.name)) continue;
          const kind = hostPropertyKind(input.name);
          if (!kind) continue;
          reported.add(input.name);
          if (input.node !== parameter) {
            if (reportedDeclarations.has(input.node)) continue;
            reportedDeclarations.add(input.node);
          }
          context.report({
            node: input.node,
            messageId: 'reserved',
            data: {
              name: input.name,
              component: componentName
                ? ` of component "${componentName}"`
                : '',
              reason: REASONS[kind],
              suggestion: suggestedName(input.name, componentName),
            },
          });
        }
      },
    };
  },
};

/**
 * The inputs the factory declares, with the node that declares each one.
 * Typed linting reads the parameter's type, so aliases and imported types are
 * covered; otherwise the annotation and the file's own type declarations are
 * read.
 */
function declaredInputs(parameter, sourceCode) {
  const typed = typedInputs(parameter, sourceCode);
  if (typed) return typed;

  const annotation = parameter.typeAnnotation?.typeAnnotation;
  const inputs = annotation
    ? annotatedInputs(
        annotation,
        localTypeDeclarations(sourceCode.ast),
        new Set(),
      )
    : [];
  if (parameter.type === 'ObjectPattern') {
    for (const property of parameter.properties) {
      if (property.type !== 'Property') continue;
      const name = propertyName(property.key, property.computed);
      if (name !== undefined) inputs.push({ name, node: property.key });
    }
  }
  return inputs.map((input) => ({ ...input, node: input.node ?? parameter }));
}

function typedInputs(parameter, sourceCode) {
  const services = sourceCode.parserServices;
  const program = services?.program;
  const toTs = services?.esTreeNodeToTSNodeMap;
  if (!program || !toTs?.has(parameter)) return undefined;
  try {
    const checker = program.getTypeChecker();
    const type = checker.getTypeAtLocation(toTs.get(parameter));
    if (checker.typeToString(type) === 'any') return [];
    const toEsTree = services.tsNodeToESTreeNodeMap;
    const file = toTs.get(parameter).getSourceFile();
    return checker.getPropertiesOfType(type).map((symbol) => {
      const declaration = symbol.declarations?.find(
        (candidate) => candidate.getSourceFile() === file,
      );
      const declared =
        declaration && toEsTree?.get(declaration.name ?? declaration);
      return { name: symbol.name, node: declared ?? parameter };
    });
  } catch {
    // The parser's program could not resolve the type (for example while
    // linting an isolated snippet): fall back to the annotation syntax.
    return undefined;
  }
}

function annotatedInputs(typeNode, declarations, seen) {
  const type = unwrap(typeNode);
  if (!type) return [];

  if (type.type === 'TSTypeLiteral') {
    return members(type.members);
  }
  if (type.type === 'TSInterfaceBody') {
    return members(type.body);
  }
  if (type.type === 'TSIntersectionType' || type.type === 'TSUnionType') {
    return type.types.flatMap((part) =>
      annotatedInputs(part, declarations, seen),
    );
  }
  if (type.type === 'TSTypeReference' && type.typeName.type === 'Identifier') {
    const name = type.typeName.name;
    const declaration = declarations.get(name);
    if (!declaration || seen.has(name)) return [];
    const nextSeen = new Set(seen).add(name);
    const inherited =
      declaration.type === 'TSInterfaceDeclaration'
        ? (declaration.extends ?? []).flatMap((heritage) =>
            heritage.expression.type === 'Identifier'
              ? annotatedInputs(
                  {
                    type: 'TSTypeReference',
                    typeName: heritage.expression,
                  },
                  declarations,
                  nextSeen,
                )
              : [],
          )
        : [];
    const own =
      declaration.type === 'TSInterfaceDeclaration'
        ? annotatedInputs(declaration.body, declarations, nextSeen)
        : annotatedInputs(declaration.typeAnnotation, declarations, nextSeen);
    return [...own, ...inherited];
  }
  return [];
}

function members(list) {
  const inputs = [];
  for (const member of list) {
    if (
      member.type !== 'TSPropertySignature' &&
      member.type !== 'TSMethodSignature'
    ) {
      continue;
    }
    const name = propertyName(member.key, member.computed);
    if (name !== undefined) inputs.push({ name, node: member.key });
  }
  return inputs;
}

function localTypeDeclarations(program) {
  const declarations = new Map();
  for (const statement of program.body ?? []) {
    const declaration =
      statement.type === 'ExportNamedDeclaration'
        ? statement.declaration
        : statement;
    if (
      declaration?.type === 'TSTypeAliasDeclaration' ||
      declaration?.type === 'TSInterfaceDeclaration'
    ) {
      declarations.set(declaration.id.name, declaration);
    }
  }
  return declarations;
}

/** `title` in `Card` → `cardTitle`; `data-id` in `Row` → `rowDataId`. */
function suggestedName(name, componentName) {
  const camel = name
    .replace(/[-_]+([a-zA-Z0-9])/g, (_, next) => next.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '');
  const prefix = (componentName ?? '').replace(/[^a-zA-Z0-9]/g, '');
  if (!prefix || /^[0-9]/.test(prefix)) return `${camel}Text`;
  return `${prefix[0].toLowerCase()}${prefix.slice(1)}${camel[0].toUpperCase()}${camel.slice(1)}`;
}

function isCraftComponent(callee, sourceCode) {
  const node = unwrap(callee);
  if (node?.type === 'Identifier') {
    return importedBinding(node, sourceCode, 'ImportSpecifier');
  }
  return (
    node?.type === 'MemberExpression' &&
    !node.computed &&
    node.object.type === 'Identifier' &&
    propertyName(node.property) === 'craftComponent' &&
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
        const moduleName = definition.parent?.source?.value ?? '';
        const imported =
          definition.node.imported?.name ?? definition.node.imported?.value;
        // `@craft-ts/component`, or a relative import inside the package.
        return (
          (moduleName === COMPONENT_MODULE || moduleName.startsWith('.')) &&
          (importKind === 'ImportNamespaceSpecifier' ||
            imported === 'craftComponent')
        );
      });
    }
    scope = scope.upper;
  }
  return false;
}

function staticString(node) {
  const value = unwrap(node);
  if (value?.type === 'Literal' && typeof value.value === 'string') {
    return value.value;
  }
  if (value?.type === 'TemplateLiteral' && value.expressions.length === 0) {
    return value.quasis[0]?.value.cooked ?? undefined;
  }
  return undefined;
}

function propertyName(node, computed = false) {
  if (node?.type === 'Identifier' && !computed) return node.name;
  if (node?.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  return undefined;
}

function isFunction(node) {
  return (
    node?.type === 'FunctionExpression' ||
    node?.type === 'ArrowFunctionExpression' ||
    node?.type === 'FunctionDeclaration'
  );
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
