const fs = require('node:fs');
const moduleApi = require('node:module');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const { Project } = require('ts-morph');
const {
  analyzeSourceFileDependencies,
  discoverAngularBrandConfigFilePath,
  transformSourceFile,
} = loadAngularBrandCodemod();

const projectCache = new Map();

function loadAngularBrandCodemod() {
  const filePath = path.resolve(
    __dirname,
    '../scripts/angular-brand-codemod.ts',
  );
  const compiledFilePath = `${filePath}.cjs`;
  const sourceText = fs.readFileSync(filePath, 'utf8');
  const librarySourceText = sourceText.replace(
    /\n\/\/ Check if this module is being run directly[\s\S]*$/,
    '\n',
  );
  const transpiled = ts.transpileModule(librarySourceText, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
    },
    fileName: filePath,
  });
  const wrappedSource = module.constructor.wrap(transpiled.outputText);
  const evaluate = vm.runInThisContext(wrappedSource, {
    filename: compiledFilePath,
  });
  const loadedModule = { exports: {} };
  evaluate(
    loadedModule.exports,
    moduleApi.createRequire(compiledFilePath),
    loadedModule,
    compiledFilePath,
    path.dirname(filePath),
  );
  return loadedModule.exports;
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Ensure Angular components, directives, and pipes expose a generated GenDeps alias.',
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
        const sourceFile = getProjectSourceFile(
          getProject(getCwd(context)),
          filePath,
          text,
        );
        const configFilePath = discoverAngularBrandConfigFilePath(
          path.dirname(filePath),
          getCwd(context),
        );
        const analysis = analyzeSourceFileDependencies(sourceFile, {
          configFilePath,
        });
        if (
          !analysis.classDeclaration ||
          analysis.skipped ||
          !analysis.generatedTypeName
        ) {
          return;
        }

        if (sourceFile.getTypeAlias(analysis.generatedTypeName)) {
          return;
        }

        const reportLoc = getNodeLoc(sourceCode, analysis.classDeclaration);

        transformSourceFile(sourceFile, { configFilePath });

        if (!sourceFile.getTypeAlias(analysis.generatedTypeName)) {
          return;
        }

        const fixedText = sourceFile.getFullText();
        if (fixedText === text) {
          return;
        }

        context.report({
          loc: reportLoc,
          message: `${analysis.generatedTypeName} is missing. Run ESLint --fix on this file or craft-brand --root <source-root> to generate it.`,
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

function getNodeLoc(sourceCode, node) {
  return {
    start: sourceCode.getLocFromIndex(node.getStart()),
    end: sourceCode.getLocFromIndex(node.getEnd()),
  };
}
