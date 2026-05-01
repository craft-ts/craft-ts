const fs = require('node:fs');
const path = require('node:path');

process.env.TS_NODE_PROJECT ??= path.resolve(
  __dirname,
  '../tsconfig.codemod.json',
);
try {
  require('ts-node/register/transpile-only');
} catch {
  require('@swc-node/register/register');
}

const { Project, Node, SyntaxKind } = require('ts-morph');
const { getAngularKind } = require('../scripts/angular-brand-codemod.ts');

const projectCache = new Map();

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow direct exports of Angular symbols managed through brandAngularSymbol.',
    },
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
        if (!text.includes('export')) {
          return;
        }

        const sourceFile = getProjectSourceFile(
          getProject(getCwd(context)),
          filePath,
          text,
        );
        const angularClasses = sourceFile
          .getClasses()
          .map((classDeclaration) => ({
            classDeclaration,
            angularKind: getAngularKind(classDeclaration),
          }))
          .filter((entry) => Boolean(entry.angularKind));

        for (const { classDeclaration, angularKind } of angularClasses) {
          reportDirectClassExport(
            context,
            sourceCode,
            classDeclaration,
            angularKind,
          );
          reportIdentifierExportAssignment(
            context,
            sourceCode,
            sourceFile,
            classDeclaration,
            angularKind,
          );
          reportNamedExports(
            context,
            sourceCode,
            sourceFile,
            classDeclaration,
            angularKind,
          );
        }
      },
    };
  },
};

function getProject(cwd) {
  let project = projectCache.get(cwd);
  if (project) {
    return project;
  }

  const tsConfigFilePath = path.join(cwd, 'tsconfig.json');
  project = fs.existsSync(tsConfigFilePath)
    ? new Project({ tsConfigFilePath })
    : new Project({
        compilerOptions: {
          experimentalDecorators: true,
          target: 9,
        },
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

function reportDirectClassExport(
  context,
  sourceCode,
  classDeclaration,
  angularKind,
) {
  const hasDirectExportModifier = classDeclaration
    .getModifiers()
    .some(
      (modifier) =>
        modifier.getKind() === SyntaxKind.ExportKeyword ||
        modifier.getKind() === SyntaxKind.DefaultKeyword,
    );

  if (!hasDirectExportModifier) {
    return;
  }

  reportNode(
    context,
    sourceCode,
    classDeclaration,
    `Do not export ${formatAngularKind(angularKind)} classes directly. Keep the class local and export default brandAngularSymbol(...).`,
  );
}

function reportIdentifierExportAssignment(
  context,
  sourceCode,
  sourceFile,
  classDeclaration,
  angularKind,
) {
  const className = classDeclaration.getName();
  if (!className) {
    return;
  }

  for (const exportAssignment of sourceFile.getExportAssignments()) {
    if (exportAssignment.isExportEquals()) {
      continue;
    }

    const expression = exportAssignment.getExpression();
    if (!Node.isIdentifier(expression) || expression.getText() !== className) {
      continue;
    }

    reportNode(
      context,
      sourceCode,
      exportAssignment,
      `Do not export ${formatAngularKind(angularKind)} classes directly. Use export default brandAngularSymbol(${className}, deps(...)).`,
    );
  }
}

function reportNamedExports(
  context,
  sourceCode,
  sourceFile,
  classDeclaration,
  angularKind,
) {
  const className = classDeclaration.getName();
  if (!className) {
    return;
  }

  for (const exportDeclaration of sourceFile.getExportDeclarations()) {
    if (exportDeclaration.getModuleSpecifier()) {
      continue;
    }

    for (const namedExport of exportDeclaration.getNamedExports()) {
      if (namedExport.getName() !== className) {
        continue;
      }

      reportNode(
        context,
        sourceCode,
        namedExport,
        `Do not export ${formatAngularKind(angularKind)} classes directly. Keep ${className} local and export the branded symbol instead.`,
      );
    }
  }
}

function reportNode(context, sourceCode, node, message) {
  context.report({
    loc: {
      start: sourceCode.getLocFromIndex(node.getStart()),
      end: sourceCode.getLocFromIndex(node.getEnd()),
    },
    message,
  });
}

function formatAngularKind(angularKind) {
  switch (angularKind) {
    case 'component':
      return '@Component';
    case 'directive':
      return '@Directive';
    case 'pipe':
      return '@Pipe';
    case 'injectable':
      return '@Injectable';
    default:
      return 'Angular';
  }
}
