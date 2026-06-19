const fs = require('node:fs');
const path = require('node:path');
const { IndentationText, Node, Project, QuoteKind, SyntaxKind } = require('ts-morph');

const projectCache = new Map();

const ROUTES_FACTORY = 'craftRoutes';
const ROUTE_FN = 'craftRoute';
const PENDING_PROP = 'pendingComponent';
const VT_PROP = 'withLoaderViewTransitionImage';
const CHECK_TYPE = 'RouteCheckedDI';
const CASCADE_TYPE = 'ValidateCascadeRoutesFile';
const CAN_RUN = 'CanRun';

/**
 * Ensures every route with a lazy `pendingComponent: () => import('./x')` is
 * verified with the per-component, O(1) `RouteCheckedDI` check (setup.md
 * "Escape hatch"). The aggregated cascade never sees the pending component, so
 * its DI must be checked directly — and `RouteCheckedDI` is used (not a second
 * aggregated pass) to stay off the instantiation-count budget.
 *
 * Autofix generates the whole block:
 *
 *   type _Check<Feature>PendingDI = RouteCheckedDI<
 *     import('./x').GenDeps_<DefaultExportClass>,
 *     '<CollectionParam>Params' | '<Collection><Route>ViewTransition',  // route auto-provides these
 *     <ParentValues>,                                                   // borrowed from the cascade check
 *     'pending component: <path>'
 *   >;
 *   type _CanRun<Feature>Pending = CanRun<_Check<Feature>PendingDI>;
 *
 * The `GenDeps_*` alias is read from the skeleton module, the available service
 * names are derived from the route's path params + (when present) its
 * `withLoaderViewTransitionImage` payload, and the parent context is taken from
 * the collection's own `ValidateCascadeRoutesFile<…, typeof xRoutes>`. If that
 * cascade check is absent (so the context can't be inferred), the rule reports
 * without a fix.
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Ensure every route with a lazy pendingComponent is verified with RouteCheckedDI(...).',
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
        if (!text.includes(PENDING_PROP)) {
          return;
        }

        const sourceFile = getProjectSourceFile(
          getProject(getCwd(context)),
          filePath,
          text,
        );

        const collections = collectCollections(sourceFile, filePath);
        const pendingRoutes = collections.flatMap((c) => c.pendingRoutes);
        if (pendingRoutes.length === 0) {
          return;
        }

        const checkedFirstArgs = collectCheckedGenDeps(sourceFile);
        const cascadeContexts = collectCascadeContexts(sourceFile);

        const issues = pendingRoutes.filter(
          (route) => !checkedFirstArgs.has(normalize(route.genDepsRef)),
        );
        if (issues.length === 0) {
          return;
        }

        const reportLoc = getNodeLoc(sourceCode, issues[0].reportNode);

        let fixable = true;
        for (const issue of issues) {
          const ctx = cascadeContexts.get(`typeof ${issue.routesName}`);
          if (!ctx) {
            fixable = false;
            continue;
          }
          appendCheck(sourceFile, issue, ctx);
        }

        if (fixable) {
          ensureImports(sourceFile, [CHECK_TYPE, CAN_RUN]);
        }

        const fixedText = sourceFile.getFullText();
        const message = `craftRoute(s) with a pendingComponent must be verified with ${CHECK_TYPE}(): ${issues
          .map((i) => i.path)
          .join(', ')}`;

        if (!fixable || fixedText === text) {
          context.report({ loc: reportLoc, message });
          return;
        }

        context.report({
          loc: reportLoc,
          message,
          fix(fixer) {
            return fixer.replaceTextRange([0, text.length], fixedText);
          },
        });
      },
    };
  },
};

function collectCollections(sourceFile, filePath) {
  const collections = [];

  for (const call of sourceFile.getDescendantsOfKind(
    SyntaxKind.CallExpression,
  )) {
    if (call.getExpression().getText() !== ROUTES_FACTORY) {
      continue;
    }

    const collectionName = getStringArg(call, 0);
    const routesArray = call.getArguments()[1];
    if (!collectionName || !routesArray) {
      continue;
    }

    const routesName = getRoutesBindingName(call);
    if (!routesName) {
      continue;
    }

    const pendingRoutes = [];
    for (const element of getArrayElements(routesArray)) {
      const route = readRoute(element);
      if (!route) {
        continue;
      }

      const importSpecifier = getLazyImportSpecifier(route.object, PENDING_PROP);
      if (!importSpecifier) {
        continue;
      }

      const genDepsName = resolveGenDepsName(filePath, importSpecifier);
      if (!genDepsName) {
        continue;
      }

      pendingRoutes.push({
        routesName,
        path: route.path,
        genDepsRef: `import('${importSpecifier}').${genDepsName}`,
        availableNames: deriveAvailableNames(
          collectionName,
          route.path,
          hasProperty(route.object, VT_PROP),
        ),
        suffix: toPascalCase(routesName.replace(/Routes$/, '')),
        reportNode: getPropertyAssignment(route.object, PENDING_PROP),
      });
    }

    collections.push({ collectionName, routesName, pendingRoutes });
  }

  return collections;
}

// A route element is either `craftRoute('<path>', { … })` or a `{ path: '<path>', … }`
// object literal. Returns the path string and the route's object literal.
function readRoute(element) {
  if (Node.isCallExpression(element) && element.getExpression().getText() === ROUTE_FN) {
    const pathArg = getStringArg(element, 0);
    const object = element.getArguments()[1];
    if (pathArg !== undefined && object && Node.isObjectLiteralExpression(object)) {
      return { path: pathArg, object };
    }
    return undefined;
  }

  if (Node.isObjectLiteralExpression(element)) {
    const pathProp = getPropertyAssignment(element, 'path');
    const initializer = pathProp?.getInitializer();
    if (initializer && Node.isStringLiteral(initializer)) {
      return { path: initializer.getLiteralText(), object: element };
    }
  }

  return undefined;
}

// `${Collection}${Param}Params` for each `:param`, plus
// `${Collection}${RouteBase}ViewTransition` when the route declares a payload.
function deriveAvailableNames(collectionName, routePath, hasViewTransition) {
  const collection = toPascalCase(collectionName);
  const names = [];

  for (const segment of routePath.split('/')) {
    if (segment.startsWith(':')) {
      const param = segment.slice(1).replace(/\?$/, '');
      names.push(`${collection}${toPascalCase(param)}Params`);
    }
  }

  if (hasViewTransition) {
    names.push(`${collection}${routeBaseServiceName(routePath)}ViewTransition`);
  }

  return names;
}

function routeBaseServiceName(routePath) {
  const name = routePath
    .split('/')
    .filter(Boolean)
    .map((segment) =>
      segment === '**'
        ? 'Wildcard'
        : toPascalCase(segment.replace(/^:/, '').replace(/\?$/, '')),
    )
    .join('');
  return name || 'Root';
}

function getArrayElements(node) {
  return Node.isArrayLiteralExpression(node) ? node.getElements() : [];
}

function getStringArg(call, index) {
  const arg = call.getArguments()[index];
  return arg && Node.isStringLiteral(arg) ? arg.getLiteralText() : undefined;
}

function getPropertyAssignment(objectLiteral, name) {
  if (!Node.isObjectLiteralExpression(objectLiteral)) {
    return undefined;
  }
  const property = objectLiteral
    .getProperties()
    .find(
      (candidate) =>
        Node.isPropertyAssignment(candidate) && candidate.getName() === name,
    );
  return Node.isPropertyAssignment(property) ? property : undefined;
}

function hasProperty(objectLiteral, name) {
  return getPropertyAssignment(objectLiteral, name) !== undefined;
}

function getLazyImportSpecifier(objectLiteral, propertyName) {
  const property = getPropertyAssignment(objectLiteral, propertyName);
  const initializer = property?.getInitializer();
  if (!initializer || !Node.isArrowFunction(initializer)) {
    return undefined;
  }

  const body = initializer.getBody();
  const callExpression = Node.isCallExpression(body) ? body : undefined;
  if (
    !callExpression ||
    callExpression.getExpression().getKind() !== SyntaxKind.ImportKeyword
  ) {
    return undefined;
  }

  const [argument] = callExpression.getArguments();
  return argument && Node.isStringLiteral(argument)
    ? argument.getLiteralText()
    : undefined;
}

function getRoutesBindingName(call) {
  const declaration = call.getFirstAncestorByKind(
    SyntaxKind.VariableDeclaration,
  );
  const nameNode = declaration?.getNameNode();
  if (!nameNode || nameNode.getKind() !== SyntaxKind.ObjectBindingPattern) {
    return undefined;
  }

  const elements = nameNode.getElements();
  const expected =
    getStringArg(call, 0) !== undefined ? `${getStringArg(call, 0)}Routes` : undefined;
  if (expected) {
    const match = elements.find(
      (element) =>
        (element.getPropertyNameNode()?.getText() ?? element.getName()) ===
        expected,
    );
    if (match) {
      return match.getName();
    }
  }

  const routesElements = elements.filter((element) =>
    (element.getPropertyNameNode()?.getText() ?? element.getName()).endsWith(
      'Routes',
    ),
  );
  return routesElements.length === 1 ? routesElements[0].getName() : undefined;
}

// First type-argument text of every `RouteCheckedDI<First, …>` already present.
function collectCheckedGenDeps(sourceFile) {
  const checked = new Set();
  for (const reference of sourceFile.getDescendantsOfKind(
    SyntaxKind.TypeReference,
  )) {
    if (reference.getTypeName().getText() !== CHECK_TYPE) {
      continue;
    }
    const first = reference.getTypeArguments()[0];
    if (first) {
      checked.add(normalize(first.getText()));
    }
  }
  return checked;
}

// `typeof xRoutes` -> "ParentNames, ParentValues" from the cascade check.
function collectCascadeContexts(sourceFile) {
  const contexts = new Map();
  for (const reference of sourceFile.getDescendantsOfKind(
    SyntaxKind.TypeReference,
  )) {
    if (reference.getTypeName().getText() !== CASCADE_TYPE) {
      continue;
    }
    const args = reference.getTypeArguments();
    if (args.length >= 3) {
      contexts.set(args[2].getText(), {
        names: args[0].getText(),
        values: args[1].getText(),
      });
    }
  }
  return contexts;
}

function appendCheck(sourceFile, issue, parentContext) {
  const quoted = issue.availableNames.map((name) => `'${name}'`);
  const available =
    parentContext.names === 'never'
      ? quoted.join(' | ') || 'never'
      : [parentContext.names, ...quoted].join(' | ');

  sourceFile.addStatements((writer) => {
    writer.blankLine();
    writer.writeLine(`type _Check${issue.suffix}PendingDI = ${CHECK_TYPE}<`);
    writer.writeLine(`  ${issue.genDepsRef},`);
    writer.writeLine(`  ${available},`);
    writer.writeLine(`  ${parentContext.values},`);
    writer.writeLine(`  'pending component: ${issue.path}'`);
    writer.writeLine('>;');
    writer.writeLine(
      `type _CanRun${issue.suffix}Pending = ${CAN_RUN}<_Check${issue.suffix}PendingDI>;`,
    );
  });
}

function resolveGenDepsName(fromFilePath, importSpecifier) {
  if (!importSpecifier.startsWith('.')) {
    return undefined;
  }
  const resolvedBase = path.resolve(path.dirname(fromFilePath), importSpecifier);
  const candidates = [
    `${resolvedBase}.ts`,
    `${resolvedBase}.tsx`,
    path.join(resolvedBase, 'index.ts'),
  ];
  const targetPath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!targetPath) {
    return undefined;
  }

  const targetText = fs.readFileSync(targetPath, 'utf8');
  const names = [...targetText.matchAll(/export\s+type\s+(GenDeps_\w+)/g)].map(
    (match) => match[1],
  );
  if (names.length === 0) {
    return undefined;
  }

  const defaultClass = targetText.match(/export\s+default\s+class\s+(\w+)/);
  if (defaultClass) {
    const preferred = `GenDeps_${defaultClass[1]}`;
    if (names.includes(preferred)) {
      return preferred;
    }
  }
  return names[0];
}

function ensureImports(sourceFile, names) {
  const craftImport = sourceFile
    .getImportDeclarations()
    .find((imp) => imp.getModuleSpecifierValue() === '@craft-ng/core');
  if (!craftImport) {
    sourceFile.addImportDeclaration({
      moduleSpecifier: '@craft-ng/core',
      namedImports: names.map((name) => ({ name, isTypeOnly: true })),
    });
    return;
  }
  const existing = new Set(
    craftImport.getNamedImports().map((ni) => ni.getName()),
  );
  for (const name of names) {
    if (!existing.has(name)) {
      craftImport.addNamedImport({ name, isTypeOnly: true });
    }
  }
}

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
  const existing = project.getSourceFile(normalizedPath);
  if (existing) {
    existing.replaceWithText(text);
    return existing;
  }
  const added = project.addSourceFileAtPathIfExists(normalizedPath);
  if (added) {
    added.replaceWithText(text);
    return added;
  }
  return project.createSourceFile(normalizedPath, text, { overwrite: true });
}

function getFilePath(context) {
  const filePath = context.filename ?? context.getFilename();
  return !filePath || filePath === '<input>' ? undefined : filePath;
}

function getCwd(context) {
  return context.cwd ?? process.cwd();
}

function getNodeLoc(sourceCode, node) {
  return {
    start: sourceCode.getLocFromIndex(node.getStart()),
    end: sourceCode.getLocFromIndex(node.getEnd()),
  };
}

function toPascalCase(value) {
  return value
    .replace(/^:/, '')
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((segment) => segment[0].toUpperCase() + segment.slice(1))
    .join('');
}

function normalize(text) {
  return text.replace(/\s+/g, ' ').trim();
}
