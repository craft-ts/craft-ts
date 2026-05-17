const fs = require('node:fs');
const path = require('node:path');
const {
  IndentationText,
  Project,
  QuoteKind,
  Scope,
  SyntaxKind,
} = require('ts-morph');

const projectCache = new Map();

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        "Ensure Angular @Component and @Directive classes declare 'private readonly _monitoring = componentMonitoring()'.",
    },
    fixable: 'code',
    schema: [],
    messages: {
      missingMonitoring:
        "Component/Directive '{{className}}' must declare 'private readonly _monitoring = componentMonitoring()'.",
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
        if (!text.includes('@Component') && !text.includes('@Directive')) {
          return;
        }

        const sourceFile = getProjectSourceFile(
          getProject(getCwd(context)),
          filePath,
          text,
        );

        const issues = collectMonitoringIssues(sourceFile);
        if (issues.length === 0) {
          return;
        }

        const reportLoc = getNodeLoc(sourceCode, issues[0].classDeclaration);

        for (const issue of issues) {
          applyMonitoringFix(issue);
        }
        ensureComponentMonitoringImport(sourceFile);

        const fixedText = sourceFile.getFullText();
        if (fixedText === text) {
          return;
        }

        const classNames = issues.map((i) => i.className).join(', ');

        context.report({
          loc: reportLoc,
          message: `Component(s) missing componentMonitoring(): ${classNames}`,
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

function getNodeLoc(sourceCode, node) {
  return {
    start: sourceCode.getLocFromIndex(node.getStart()),
    end: sourceCode.getLocFromIndex(node.getEnd()),
  };
}

function isAngularComponentOrDirective(classDeclaration) {
  for (const decorator of classDeclaration.getDecorators()) {
    const name = decorator.getName();
    if (name === 'Component' || name === 'Directive') {
      return true;
    }
  }
  return false;
}

function hasMonitoringProperty(classDeclaration) {
  for (const prop of classDeclaration.getProperties()) {
    if (
      prop.getName() === '_monitoring' &&
      prop.hasModifier(SyntaxKind.PrivateKeyword) &&
      prop.isReadonly()
    ) {
      const initializer = prop.getInitializer();
      if (
        initializer &&
        initializer.getKindName() === 'CallExpression' &&
        initializer.getText().startsWith('componentMonitoring(')
      ) {
        return true;
      }
    }
  }
  return false;
}

function collectMonitoringIssues(sourceFile) {
  const issues = [];

  for (const classDeclaration of sourceFile.getClasses()) {
    const className = classDeclaration.getName();
    if (!className) continue;
    if (!isAngularComponentOrDirective(classDeclaration)) continue;
    if (hasMonitoringProperty(classDeclaration)) continue;

    issues.push({ className, classDeclaration });
  }

  return issues;
}

function applyMonitoringFix(issue) {
  const { classDeclaration } = issue;

  // Insert as first property of the class
  classDeclaration.insertProperty(0, {
    name: '_monitoring',
    scope: Scope.Private,
    isReadonly: true,
    initializer: 'componentMonitoring()',
  });
}

function ensureComponentMonitoringImport(sourceFile) {
  const craftNgCoreImport = sourceFile
    .getImportDeclarations()
    .find((imp) => imp.getModuleSpecifierValue() === '@craft-ng/core');

  if (craftNgCoreImport) {
    const namedImports = craftNgCoreImport.getNamedImports();
    const alreadyImported = namedImports.some(
      (ni) => ni.getName() === 'componentMonitoring',
    );
    if (!alreadyImported) {
      craftNgCoreImport.addNamedImport('componentMonitoring');
    }
  } else {
    sourceFile.addImportDeclaration({
      moduleSpecifier: '@craft-ng/core',
      namedImports: ['componentMonitoring'],
    });
  }
}
