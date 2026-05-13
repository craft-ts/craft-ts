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
        "Ensure Angular @Component and @Directive classes provide provideHostName('ClassName') in providers.",
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
        if (!text.includes('@Component') && !text.includes('@Directive')) {
          return;
        }

        const sourceFile = getProjectSourceFile(
          getProject(getCwd(context)),
          filePath,
          text,
        );
        const issues = collectHostNameIssues(sourceFile);
        if (issues.length === 0) {
          return;
        }

        const reportLoc = getNodeLoc(sourceCode, issues[0].reportNode);

        for (const issue of issues) {
          applyIssueFix(issue);
        }
        ensureProvideHostNameImport(sourceFile);

        const fixedText = sourceFile.getFullText();
        if (fixedText === text) {
          return;
        }

        context.report({
          loc: reportLoc,
          message: formatIssueMessage(issues),
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
    ? new Project({
        tsConfigFilePath,
        manipulationSettings,
      })
    : new Project({
        compilerOptions: {
          experimentalDecorators: true,
          target: 9,
        },
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

function collectHostNameIssues(sourceFile) {
  const angularDecorators = collectAngularDecoratorNames(sourceFile);
  if (
    angularDecorators.componentNames.size === 0 &&
    angularDecorators.directiveNames.size === 0 &&
    angularDecorators.namespaceNames.size === 0
  ) {
    return [];
  }

  const issues = [];

  for (const classDeclaration of sourceFile.getClasses()) {
    const className = classDeclaration.getName();
    if (!className) {
      continue;
    }

    const decoratorMatch = findAngularDecorator(
      classDeclaration,
      angularDecorators,
    );
    if (!decoratorMatch) {
      continue;
    }

    const metadata = getDecoratorMetadata(decoratorMatch.decorator);
    if (!metadata) {
      continue;
    }

    const providersProperty = getObjectProperty(metadata, 'providers');
    if (!providersProperty) {
      issues.push({
        kind: 'missing-providers',
        className,
        metadata,
        reportNode: classDeclaration,
      });
      continue;
    }

    const providersArray = getArrayInitializer(providersProperty);
    if (!providersArray) {
      continue;
    }

    const hostNameCalls = findProvideHostNameCalls(providersArray);
    if (hostNameCalls.length === 0) {
      issues.push({
        kind: 'missing-call',
        className,
        providersArray,
        reportNode: classDeclaration,
      });
      continue;
    }

    const matchingCall = hostNameCalls.find((callExpression) =>
      isMatchingHostNameCall(callExpression, className),
    );
    if (matchingCall) {
      continue;
    }

    issues.push({
      kind: 'mismatched-call',
      className,
      callExpression: hostNameCalls[0],
      reportNode: classDeclaration,
    });
  }

  return issues;
}

function collectAngularDecoratorNames(sourceFile) {
  const componentNames = new Set();
  const directiveNames = new Set();
  const namespaceNames = new Set();

  for (const importDeclaration of sourceFile.getImportDeclarations()) {
    if (importDeclaration.getModuleSpecifierValue() !== '@angular/core') {
      continue;
    }

    for (const namedImport of importDeclaration.getNamedImports()) {
      const importedName = namedImport.getName();
      const localName = namedImport.getAliasNode()?.getText() ?? importedName;

      if (importedName === 'Component') {
        componentNames.add(localName);
      }
      if (importedName === 'Directive') {
        directiveNames.add(localName);
      }
    }

    const namespaceImport = importDeclaration.getNamespaceImport();
    if (namespaceImport) {
      namespaceNames.add(namespaceImport.getText());
    }
  }

  return {
    componentNames,
    directiveNames,
    namespaceNames,
  };
}

function findAngularDecorator(classDeclaration, angularDecorators) {
  for (const decorator of classDeclaration.getDecorators()) {
    const expression = decorator.getExpression();
    if (!Node.isCallExpression(expression)) {
      continue;
    }

    const callee = expression.getExpression();
    if (Node.isIdentifier(callee)) {
      const decoratorName = callee.getText();
      if (
        angularDecorators.componentNames.has(decoratorName) ||
        angularDecorators.directiveNames.has(decoratorName)
      ) {
        return {
          decorator,
        };
      }
      continue;
    }

    if (!Node.isPropertyAccessExpression(callee)) {
      continue;
    }

    const objectExpression = callee.getExpression();
    const propertyName = callee.getName();
    if (
      Node.isIdentifier(objectExpression) &&
      angularDecorators.namespaceNames.has(objectExpression.getText()) &&
      (propertyName === 'Component' || propertyName === 'Directive')
    ) {
      return {
        decorator,
      };
    }
  }

  return undefined;
}

function getDecoratorMetadata(decorator) {
  const expression = decorator.getExpression();
  if (!Node.isCallExpression(expression)) {
    return undefined;
  }

  const [metadataArgument] = expression.getArguments();
  if (!metadataArgument || !Node.isObjectLiteralExpression(metadataArgument)) {
    return undefined;
  }

  return metadataArgument;
}

function getObjectProperty(objectLiteralExpression, name) {
  const property = objectLiteralExpression
    .getProperties()
    .find(
      (candidate) =>
        Node.isPropertyAssignment(candidate) && candidate.getName() === name,
    );

  return Node.isPropertyAssignment(property) ? property : undefined;
}

function getArrayInitializer(propertyAssignment) {
  const initializer = propertyAssignment.getInitializer();
  if (!initializer || !Node.isArrayLiteralExpression(initializer)) {
    return undefined;
  }

  return initializer;
}

function findProvideHostNameCalls(arrayLiteralExpression) {
  return arrayLiteralExpression
    .getElements()
    .filter((element) => Node.isCallExpression(element))
    .filter((callExpression) => isProvideHostNameCall(callExpression));
}

function isProvideHostNameCall(callExpression) {
  const expression = callExpression.getExpression();
  if (Node.isIdentifier(expression)) {
    return expression.getText() === 'provideHostName';
  }

  if (Node.isPropertyAccessExpression(expression)) {
    return expression.getName() === 'provideHostName';
  }

  return false;
}

function isMatchingHostNameCall(callExpression, expectedClassName) {
  const [nameArgument] = callExpression.getArguments();
  if (
    !nameArgument ||
    (!Node.isStringLiteral(nameArgument) &&
      !Node.isNoSubstitutionTemplateLiteral(nameArgument))
  ) {
    return false;
  }

  return nameArgument.getLiteralText() === expectedClassName;
}

function applyIssueFix(issue) {
  const expectedCall = `provideHostName('${issue.className}')`;

  if (issue.kind === 'missing-providers') {
    issue.metadata.addPropertyAssignment({
      name: 'providers',
      initializer: `[${expectedCall}]`,
    });
    return;
  }

  if (issue.kind === 'missing-call') {
    issue.providersArray.addElement(expectedCall);
    return;
  }

  if (issue.kind === 'mismatched-call') {
    issue.callExpression.replaceWithText(expectedCall);
  }
}

function ensureProvideHostNameImport(sourceFile) {
  const coreImports = sourceFile
    .getImportDeclarations()
    .filter(
      (importDeclaration) =>
        importDeclaration.getModuleSpecifierValue() === '@craft-ng/core',
    );

  for (const importDeclaration of coreImports) {
    const namedImports = importDeclaration.getNamedImports();
    const directImport = namedImports.find(
      (namedImport) =>
        namedImport.getName() === 'provideHostName' &&
        !namedImport.getAliasNode(),
    );
    if (directImport) {
      return;
    }
  }

  for (const importDeclaration of coreImports) {
    for (const namedImport of importDeclaration.getNamedImports()) {
      if (
        namedImport.getName() === 'provideHostName' &&
        namedImport.getAliasNode()
      ) {
        namedImport.remove();
      }
    }
  }

  const targetImport = coreImports.find(
    (importDeclaration) => !importDeclaration.getNamespaceImport(),
  );
  if (targetImport) {
    const hasNamedImport = targetImport
      .getNamedImports()
      .some((namedImport) => namedImport.getName() === 'provideHostName');
    if (!hasNamedImport) {
      targetImport.addNamedImport('provideHostName');
    }
    return;
  }

  const insertIndex = sourceFile
    .getStatements()
    .findIndex(
      (statement) => statement.getKind() !== SyntaxKind.ImportDeclaration,
    );

  sourceFile.insertImportDeclaration(
    insertIndex < 0 ? sourceFile.getImportDeclarations().length : insertIndex,
    {
      moduleSpecifier: '@craft-ng/core',
      namedImports: ['provideHostName'],
    },
  );
}

function formatIssueMessage(issues) {
  if (issues.length === 1) {
    const className = issues[0].className;
    return `${className} must include provideHostName('${className}') in providers.`;
  }

  const classNames = [...new Set(issues.map((issue) => issue.className))].join(
    ', ',
  );
  return `Classes must include provideHostName('<ClassName>') in providers: ${classNames}.`;
}
