const fs = require('node:fs');
const path = require('node:path');
const {
  IndentationText,
  Node,
  Project,
  QuoteKind,
  SyntaxKind,
} = require('ts-morph');

const projectCache = new Map();

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Ensure route exceptions delegated to the global error component (via globalError()) are registered in CraftGlobalExceptionRegistry.',
    },
    fixable: 'code',
    schema: [],
  },
  create(context) {
    return {
      'Program:exit'() {
        const sourceCode = context.sourceCode ?? context.getSourceCode();
        const filePath = getFilePath(context);
        if (!filePath || !filePath.endsWith('.ts')) {
          return;
        }

        const text = sourceCode.getText();
        // Cheap pre-filter: the delegated outcome must appear.
        if (!text.includes('globalError')) {
          return;
        }

        const sourceFile = getProjectSourceFile(
          getProject(getCwd(context)),
          filePath,
          text,
        );
        const requiredRegistrations = collectRequiredRegistrations(sourceFile);
        if (requiredRegistrations.length === 0) {
          return;
        }

        const registryState = analyzeRegistryState(
          sourceFile,
          requiredRegistrations,
        );
        if (
          registryState.missing.length === 0 &&
          registryState.outOfDate.length === 0
        ) {
          return;
        }

        ensureRegistryEntries(sourceFile, requiredRegistrations);
        const fixedText = sourceFile.getFullText();
        if (fixedText === text) {
          return;
        }

        context.report({
          loc: getNodeLoc(sourceCode, registryState.reportNode),
          message: formatRegistryMessage(registryState),
          fix(fixer) {
            return fixer.replaceTextRange([0, text.length], fixedText);
          },
        });
      },
    };
  },
};

function getProject(cwd) {
  let project = projectCache.get(cwd);
  if (project) {
    return project;
  }

  const manipulationSettings = {
    indentationText: IndentationText.TwoSpaces,
    quoteKind: QuoteKind.Single,
  };
  const tsConfigFilePath = path.join(cwd, 'tsconfig.json');
  project = fs.existsSync(tsConfigFilePath)
    ? new Project({ tsConfigFilePath, manipulationSettings })
    : new Project({
        compilerOptions: { experimentalDecorators: true, target: 9 },
        manipulationSettings,
      });

  projectCache.set(cwd, project);
  return project;
}

function getProjectSourceFile(project, filePath, text) {
  const normalizedPath = path.resolve(filePath);
  const existingSourceFile = project.getSourceFile(normalizedPath);
  if (existingSourceFile) {
    existingSourceFile.replaceWithText(text);
    return existingSourceFile;
  }

  const sourceFile = project.addSourceFileAtPathIfExists(normalizedPath);
  if (sourceFile) {
    sourceFile.replaceWithText(text);
    return sourceFile;
  }

  return project.createSourceFile(normalizedPath, text, { overwrite: true });
}

function getFilePath(context) {
  const filePath = context.filename ?? context.getFilename();
  if (!filePath || filePath === '<input>') {
    return undefined;
  }
  return filePath;
}

function getCwd(context) {
  return context.cwd ?? process.cwd();
}

// --- collection: which (path, code) pairs must be registered ---

function collectRequiredRegistrations(sourceFile) {
  // Keyed by `${path}::${code}` to dedupe; carries the collection variable.
  const registrations = new Map();

  for (const call of sourceFile.getDescendantsOfKind(
    SyntaxKind.CallExpression,
  )) {
    if (getCallExpressionName(call) !== 'craftRoutes') {
      continue;
    }

    const collectionVar = resolveCollectionVar(call);
    if (!collectionVar) {
      continue;
    }

    const routesArray = call.getArguments()[1];
    if (!routesArray || !Node.isArrayLiteralExpression(routesArray)) {
      continue;
    }

    for (const element of routesArray.getElements()) {
      const routeDef = extractRouteDefinition(element);
      if (!routeDef) {
        continue;
      }

      for (const code of collectGlobalErrorCodes(routeDef.handleExceptions)) {
        const key = `${routeDef.path}::${code}`;
        if (!registrations.has(key)) {
          registrations.set(key, {
            path: routeDef.path,
            code,
            collectionVar,
            reportNode: routeDef.reportNode,
          });
        }
      }
    }
  }

  return [...registrations.values()];
}

function getCallExpressionName(callExpression) {
  const expression = callExpression.getExpression();
  if (Node.isIdentifier(expression)) {
    return expression.getText();
  }
  // `craftRoute(...).withProviders` etc. — the leftmost call's callee.
  if (Node.isPropertyAccessExpression(expression)) {
    return expression.getName();
  }
  return undefined;
}

// The variable the craftRoutes result is destructured into ends in `Routes`
// (e.g. `const { demoRoutes, … } = craftRoutes('demo', [...])`).
function resolveCollectionVar(craftRoutesCall) {
  const declaration = craftRoutesCall.getFirstAncestorByKind(
    SyntaxKind.VariableDeclaration,
  );
  if (!declaration) {
    return undefined;
  }

  const nameNode = declaration.getNameNode();
  if (Node.isIdentifier(nameNode)) {
    return nameNode.getText();
  }

  if (Node.isObjectBindingPattern(nameNode)) {
    const element = nameNode
      .getElements()
      .find((el) => el.getNameNode().getText().endsWith('Routes'));
    return element?.getNameNode().getText();
  }

  return undefined;
}

// A route array element is either `craftRoute('path', { … }, { … })` (optionally
// followed by `.withProviders(…)`) or a plain `{ path: '…', handleExceptions: { … } }`.
function extractRouteDefinition(element) {
  if (Node.isObjectLiteralExpression(element)) {
    const pathValue = readStringProperty(element, 'path');
    const handleExceptions = readObjectProperty(element, 'handleExceptions');
    if (!pathValue || !handleExceptions) {
      return undefined;
    }
    return { path: pathValue, handleExceptions, reportNode: element };
  }

  if (Node.isCallExpression(element)) {
    const routeCall = findRouteCall(element);
    if (!routeCall) {
      return undefined;
    }
    const [pathArg, , handlersArg] = routeCall.getArguments();
    if (
      !pathArg ||
      !handlersArg ||
      !Node.isObjectLiteralExpression(handlersArg) ||
      (!Node.isStringLiteral(pathArg) &&
        !Node.isNoSubstitutionTemplateLiteral(pathArg))
    ) {
      return undefined;
    }
    return {
      path: pathArg.getLiteralText(),
      handleExceptions: handlersArg,
      reportNode: routeCall,
    };
  }

  return undefined;
}

// Walks `craftRoute(...).withProviders(...)` (any depth) down to the `craftRoute(` call.
function findRouteCall(node) {
  let current = node;
  while (Node.isCallExpression(current)) {
    if (getCallExpressionName(current) === 'craftRoute') {
      return current;
    }
    const expression = current.getExpression();
    if (Node.isPropertyAccessExpression(expression)) {
      current = expression.getExpression();
      continue;
    }
    break;
  }
  return undefined;
}

function readStringProperty(objectLiteral, propertyName) {
  const property = objectLiteral
    .getProperties()
    .find(
      (prop) =>
        Node.isPropertyAssignment(prop) && prop.getName() === propertyName,
    );
  if (!property || !Node.isPropertyAssignment(property)) {
    return undefined;
  }
  const initializer = property.getInitializer();
  if (
    !initializer ||
    (!Node.isStringLiteral(initializer) &&
      !Node.isNoSubstitutionTemplateLiteral(initializer))
  ) {
    return undefined;
  }
  return initializer.getLiteralText();
}

function readObjectProperty(objectLiteral, propertyName) {
  const property = objectLiteral
    .getProperties()
    .find(
      (prop) =>
        Node.isPropertyAssignment(prop) && prop.getName() === propertyName,
    );
  if (!property || !Node.isPropertyAssignment(property)) {
    return undefined;
  }
  const initializer = property.getInitializer();
  return initializer && Node.isObjectLiteralExpression(initializer)
    ? initializer
    : undefined;
}

// The codes whose handler calls `globalError()` (function or generator handler).
function collectGlobalErrorCodes(handleExceptions) {
  const codes = [];
  for (const property of handleExceptions.getProperties()) {
    if (!Node.isPropertyAssignment(property)) {
      continue;
    }
    const handler = property.getInitializer();
    if (!handler || !handlerCallsGlobalError(handler)) {
      continue;
    }
    codes.push(readPropertyAssignmentName(property));
  }
  return codes;
}

function handlerCallsGlobalError(handlerNode) {
  return handlerNode
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .some((call) => {
      const expression = call.getExpression();
      return Node.isIdentifier(expression) && expression.getText() === 'globalError';
    });
}

function readPropertyAssignmentName(property) {
  const nameNode = property.getNameNode();
  if (Node.isStringLiteral(nameNode) || Node.isNumericLiteral(nameNode)) {
    return nameNode.getLiteralText();
  }
  return property.getName();
}

// --- registry analysis + maintenance ---

function expectedTypeFor(registration) {
  return `CraftRouteExceptionType<typeof ${registration.collectionVar}, '${registration.path}', '${registration.code}'>`;
}

function groupByPath(registrations) {
  const byPath = new Map();
  for (const registration of registrations) {
    const entry = byPath.get(registration.path) ?? [];
    entry.push(registration);
    byPath.set(registration.path, entry);
  }
  return byPath;
}

function expectedPathType(entries) {
  const members = entries
    .map(
      (registration) =>
        `${formatPropertyName(registration.code)}: ${expectedTypeFor(registration)}`,
    )
    .join('; ');
  return `{ ${members} }`;
}

function analyzeRegistryState(sourceFile, requiredRegistrations) {
  const registryInterface = getGlobalRegistryInterface(sourceFile);
  const propertiesByName = new Map(
    (registryInterface?.getProperties() ?? []).map((property) => [
      readInterfacePropertyName(property),
      property,
    ]),
  );

  const missing = [];
  const outOfDate = [];

  for (const [routePath, entries] of groupByPath(requiredRegistrations)) {
    const property = propertiesByName.get(routePath);
    if (!property) {
      missing.push(routePath);
      continue;
    }
    const currentType = normalizeText(property.getTypeNode()?.getText() ?? '');
    const expectedType = normalizeText(expectedPathType(entries));
    if (currentType !== expectedType) {
      outOfDate.push(routePath);
    }
  }

  return {
    missing,
    outOfDate,
    reportNode: requiredRegistrations[0].reportNode,
  };
}

// A file may have several `declare module '@craft-ng/core'` blocks (e.g. one for
// CraftRouterRoutesRegistry and one for CraftGlobalExceptionRegistry), so search
// all of them rather than the first.
function getCraftCoreModuleDeclarations(sourceFile) {
  return sourceFile.getModules().filter((moduleDeclaration) => {
    const nameNode = moduleDeclaration.getNameNode();
    return (
      Node.isStringLiteral(nameNode) &&
      nameNode.getLiteralText() === '@craft-ng/core'
    );
  });
}

function getGlobalRegistryInterface(sourceFile) {
  for (const moduleDeclaration of getCraftCoreModuleDeclarations(sourceFile)) {
    const registryInterface = moduleDeclaration.getInterface(
      'CraftGlobalExceptionRegistry',
    );
    if (registryInterface) {
      return registryInterface;
    }
  }
  return undefined;
}

function readInterfacePropertyName(property) {
  const nameNode = property.getNameNode();
  if (Node.isStringLiteral(nameNode) || Node.isNumericLiteral(nameNode)) {
    return nameNode.getLiteralText();
  }
  return property.getName();
}

function ensureRegistryEntries(sourceFile, requiredRegistrations) {
  let registryInterface = getGlobalRegistryInterface(sourceFile);
  if (!registryInterface) {
    const moduleDeclaration =
      getCraftCoreModuleDeclarations(sourceFile)[0] ??
      sourceFile.addModule({
        name: "'@craft-ng/core'",
        hasDeclareKeyword: true,
      });
    registryInterface = moduleDeclaration.addInterface({
      name: 'CraftGlobalExceptionRegistry',
    });
  }

  const propertiesByName = new Map(
    registryInterface
      .getProperties()
      .map((property) => [readInterfacePropertyName(property), property]),
  );

  for (const [routePath, entries] of groupByPath(requiredRegistrations)) {
    const expectedType = expectedPathType(entries);
    const property = propertiesByName.get(routePath);
    if (!property) {
      registryInterface.addProperty({
        name: formatPropertyName(routePath),
        type: expectedType,
      });
      continue;
    }
    property.setType(expectedType);
  }
}

function formatPropertyName(name) {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name) ? name : `'${name}'`;
}

function getNodeLoc(sourceCode, node) {
  return {
    start: sourceCode.getLocFromIndex(node.getStart()),
    end: sourceCode.getLocFromIndex(node.getEnd()),
  };
}

function formatRegistryMessage({ missing, outOfDate }) {
  const segments = [];
  if (missing.length > 0) {
    segments.push(`missing ${formatNameList(missing)}`);
  }
  if (outOfDate.length > 0) {
    segments.push(`out of date for ${formatNameList(outOfDate)}`);
  }
  return `CraftGlobalExceptionRegistry is ${segments.join(' and ')}. Run ESLint --fix on this file to register globalError() route exceptions.`;
}

function formatNameList(names) {
  if (names.length === 1) {
    return `'${names[0]}'`;
  }
  if (names.length === 2) {
    return `'${names[0]}' and '${names[1]}'`;
  }
  return `${names
    .slice(0, -1)
    .map((name) => `'${name}'`)
    .join(', ')}, and '${names[names.length - 1]}'`;
}

// Compares two type strings for equality up to Prettier's formatting freedom.
// The rule emits the type on one line, but Prettier re-wraps long entries across
// lines — which introduces spaces around `<`/`>`/`,` and a trailing `;` before the
// closing brace. Collapsing whitespace alone would leave those, so the comparison
// would flip to "out of date" and fight Prettier forever. We additionally strip
// spaces adjacent to punctuation (keeping token boundaries like `typeof demoRoutes`
// intact) and drop a member-terminating `;` right before a `}`.
function normalizeText(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s*([<>(),;])\s*/g, '$1')
    .replace(/;(?=}|$)/g, '')
    .trim();
}
