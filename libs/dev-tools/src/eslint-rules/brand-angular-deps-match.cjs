const fs = require('node:fs');
const path = require('node:path');

process.env.TS_NODE_PROJECT ??= path.resolve(
  __dirname,
  '../tsconfig.codemod.json',
);
require('ts-node/register/transpile-only');

const { Project } = require('ts-morph');
const {
  analyzeSourceFileDependencies,
  readExistingDependencyGroups,
} = require('../scripts/angular-brand-codemod.ts');

const projectCache = new Map();

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Ensure deps({ injected, importDeps, providers }) matches the Angular symbol dependencies.',
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
        if (!text.includes('brandAngularSymbol') || !text.includes('deps(')) {
          return;
        }

        const sourceFile = getProjectSourceFile(
          getProject(getCwd(context)),
          filePath,
          text,
        );
        const analysis = analyzeSourceFileDependencies(sourceFile);
        if (
          !analysis.classDeclaration ||
          analysis.skipped ||
          !analysis.className
        ) {
          return;
        }

        const existing = readExistingDependencyGroups(
          sourceFile,
          analysis.className,
        );
        if (!existing.found) {
          return;
        }

        if (existing.warnings.length > 0) {
          for (const warning of existing.warnings) {
            reportNode(
              context,
              sourceCode,
              existing.depsObjectNode ?? existing.exportAssignmentNode,
              warning,
            );
          }
          return;
        }

        reportIfMismatch(
          context,
          sourceCode,
          existing,
          'injected',
          analysis.dependencyGroups.injected,
          existing.dependencyGroups.injected,
        );
        reportIfMismatch(
          context,
          sourceCode,
          existing,
          'importDeps',
          analysis.dependencyGroups.importDeps,
          existing.dependencyGroups.importDeps,
        );
        reportIfMismatch(
          context,
          sourceCode,
          existing,
          'providers',
          analysis.dependencyGroups.providers,
          existing.dependencyGroups.providers,
        );
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

function reportIfMismatch(
  context,
  sourceCode,
  existing,
  propertyName,
  expected,
  actual,
) {
  if (isSameDependencyList(expected, actual)) {
    return;
  }

  reportNode(
    context,
    sourceCode,
    existing.propertyNodes[propertyName] ??
      existing.depsObjectNode ??
      existing.exportAssignmentNode,
    `deps.${propertyName} does not match the Angular symbol. Expected ${formatDependencyList(expected)} but found ${formatDependencyList(actual)}.`,
  );
}

function reportNode(context, sourceCode, node, message) {
  context.report({
    loc: node ? getNodeLoc(sourceCode, node) : undefined,
    message,
  });
}

function getNodeLoc(sourceCode, node) {
  return {
    start: sourceCode.getLocFromIndex(node.getStart()),
    end: sourceCode.getLocFromIndex(node.getEnd()),
  };
}

function isSameDependencyList(left, right) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function formatDependencyList(dependencies) {
  return `[${dependencies.join(', ')}]`;
}
