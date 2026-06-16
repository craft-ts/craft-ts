const fs = require('node:fs');
const path = require('node:path');
const { IndentationText, Project, QuoteKind, SyntaxKind } = require('ts-morph');

const projectCache = new Map();

const ROUTES_FACTORY = 'craftRoutes';
const ASSERT_FN = 'assertExhaustiveRouteExceptions';

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        "Ensure every craftRoutes(...) collection is checked with assertExhaustiveRouteExceptions(...) so a route's handleExceptions stays exhaustive over its reachable codes.",
    },
    fixable: 'code',
    schema: [],
    messages: {
      missingAssert:
        "craftRoutes collection '{{routesName}}' must be checked with assertExhaustiveRouteExceptions({{routesName}}).",
    },
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
        if (!text.includes(ROUTES_FACTORY)) {
          return;
        }

        const sourceFile = getProjectSourceFile(
          getProject(getCwd(context)),
          filePath,
          text,
        );

        const collections = collectRouteCollections(sourceFile);
        if (collections.length === 0) {
          return;
        }

        const asserted = collectAssertedNames(sourceFile);
        const issues = collections.filter(
          (collection) => !asserted.has(collection.routesName),
        );
        if (issues.length === 0) {
          return;
        }

        const reportLoc = getNodeLoc(sourceCode, issues[0].callExpression);

        // Insert bottom-up so earlier statement indices stay valid.
        for (const issue of [...issues].sort(
          (a, b) => b.statementIndex - a.statementIndex,
        )) {
          sourceFile.insertStatements(
            issue.statementIndex + 1,
            `${ASSERT_FN}(${issue.routesName});`,
          );
        }
        ensureAssertImport(sourceFile);

        const fixedText = sourceFile.getFullText();
        if (fixedText === text) {
          return;
        }

        const routesNames = issues.map((i) => i.routesName).join(', ');

        context.report({
          loc: reportLoc,
          message: `craftRoutes collection(s) missing ${ASSERT_FN}(): ${routesNames}`,
          fix(fixer) {
            return fixer.replaceTextRange([0, text.length], fixedText);
          },
        });
      },
    };
  },
};

function collectRouteCollections(sourceFile) {
  const collections = [];

  for (const call of sourceFile.getDescendantsOfKind(
    SyntaxKind.CallExpression,
  )) {
    if (call.getExpression().getText() !== ROUTES_FACTORY) {
      continue;
    }

    const routesName = getRoutesBindingName(call);
    if (!routesName) {
      continue;
    }

    const statement = call.getFirstAncestorByKind(
      SyntaxKind.VariableStatement,
    );
    if (!statement || statement.getParent() !== sourceFile) {
      // Only top-level `const { xRoutes } = craftRoutes(...)` declarations can
      // be safely followed by a sibling assert statement.
      continue;
    }

    collections.push({
      routesName,
      callExpression: call,
      statementIndex: statement.getChildIndex(),
    });
  }

  return collections;
}

// The routes object is destructured as `{ <name>Routes, inject... }`. Resolve
// the local name bound to the `<name>Routes` property (honouring renames).
function getRoutesBindingName(call) {
  const declaration = call.getFirstAncestorByKind(
    SyntaxKind.VariableDeclaration,
  );
  if (!declaration) {
    return undefined;
  }

  const nameNode = declaration.getNameNode();
  if (!nameNode || nameNode.getKind() !== SyntaxKind.ObjectBindingPattern) {
    return undefined;
  }

  const elements = nameNode.getElements();
  const firstArg = call.getArguments()[0];
  const expectedProperty =
    firstArg && firstArg.getKind() === SyntaxKind.StringLiteral
      ? `${firstArg.getLiteralValue()}Routes`
      : undefined;

  if (expectedProperty) {
    const match = elements.find(
      (element) =>
        (element.getPropertyNameNode()?.getText() ?? element.getName()) ===
        expectedProperty,
    );
    if (match) {
      return match.getName();
    }
  }

  // Fallback: the single binding whose property name ends with `Routes`.
  const routesElements = elements.filter((element) =>
    (element.getPropertyNameNode()?.getText() ?? element.getName()).endsWith(
      'Routes',
    ),
  );
  return routesElements.length === 1 ? routesElements[0].getName() : undefined;
}

function collectAssertedNames(sourceFile) {
  const asserted = new Set();

  for (const call of sourceFile.getDescendantsOfKind(
    SyntaxKind.CallExpression,
  )) {
    if (call.getExpression().getText() !== ASSERT_FN) {
      continue;
    }
    const arg = call.getArguments()[0];
    if (arg) {
      asserted.add(arg.getText());
    }
  }

  return asserted;
}

function ensureAssertImport(sourceFile) {
  const craftNgCoreImport = sourceFile
    .getImportDeclarations()
    .find((imp) => imp.getModuleSpecifierValue() === '@craft-ng/core');

  if (craftNgCoreImport) {
    const alreadyImported = craftNgCoreImport
      .getNamedImports()
      .some((ni) => ni.getName() === ASSERT_FN);
    if (!alreadyImported) {
      craftNgCoreImport.addNamedImport(ASSERT_FN);
    }
  } else {
    sourceFile.addImportDeclaration({
      moduleSpecifier: '@craft-ng/core',
      namedImports: [ASSERT_FN],
    });
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

function getNodeLoc(sourceCode, node) {
  return {
    start: sourceCode.getLocFromIndex(node.getStart()),
    end: sourceCode.getLocFromIndex(node.getEnd()),
  };
}
