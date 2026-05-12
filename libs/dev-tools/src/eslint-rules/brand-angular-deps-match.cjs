const fs = require('node:fs');
const moduleApi = require('node:module');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const { Node, Project } = require('ts-morph');
const {
  analyzeSourceFileDependencies,
  discoverAngularBrandConfigFilePath,
  transformSourceFile,
} = loadAngularBrandCodemod();

const projectCache = new Map();
const typePrinter = ts.createPrinter({ removeComments: true });

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
        'Ensure generated GenDeps aliases match the Angular symbol dependencies.',
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
        if (
          !text.includes('export type GenDeps_') ||
          !text.includes('GetDeps<')
        ) {
          return;
        }

        const sourceFile = getProjectSourceFile(
          getProject(getCwd(context)),
          filePath,
          text,
        );
        const configFilePath = discoverAngularBrandConfigFilePath(
          path.dirname(filePath),
          getCwd(context),
        );
        if (process.env.DEBUG_CRAFT_RULE) {
          console.log('[DEBUG] file text snippet:', text.substring(0, 300));
          console.log('[DEBUG] sf text snippet:', sourceFile.getFullText().substring(0, 300));
        }
        const analysis = analyzeSourceFileDependencies(sourceFile, {
          configFilePath,
        });
        if (process.env.DEBUG_CRAFT_RULE) {
          console.log('[DEBUG] analysis deps:', analysis.dependencyGroups);
          console.log('[DEBUG] generated deps:', analysis.generatedDependencyGroups);
          console.log('[DEBUG] className:', analysis.className, 'kind:', analysis.angularKind);
          console.log('[DEBUG] sf has class?', !!sourceFile.getClass('DemoComponent'));
          console.log('[DEBUG] full sf text:', sourceFile.getFullText());
        }
        if (
          !analysis.classDeclaration ||
          analysis.skipped ||
          !analysis.className ||
          !analysis.generatedTypeName
        ) {
          return;
        }

        const currentGeneratedType = sourceFile.getTypeAlias(
          analysis.generatedTypeName,
        );
        if (!currentGeneratedType) {
          return;
        }

        const currentRange = getNodeRange(currentGeneratedType);
        const currentSnapshot = readGeneratedDepsSnapshot(currentGeneratedType);

        transformSourceFile(sourceFile, { configFilePath });

        const refreshedGeneratedType = sourceFile.getTypeAlias(
          analysis.generatedTypeName,
        );
        if (!refreshedGeneratedType) {
          return;
        }

        const refreshedSnapshot = readGeneratedDepsSnapshot(
          refreshedGeneratedType,
        );
        if (currentSnapshot.typeText === refreshedSnapshot.typeText) {
          return;
        }

        const staleSections = getStaleSections(
          currentSnapshot.sections,
          refreshedSnapshot.sections,
        );
        const fixedText = sourceFile.getFullText();

        context.report({
          loc: getRangeLoc(sourceCode, currentRange),
          message: formatOutOfDateMessage(
            analysis.generatedTypeName,
            staleSections,
          ),
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

function readGeneratedDepsSnapshot(typeAlias) {
  const typeNode = typeAlias.getTypeNode();
  const snapshot = {
    typeText: normalizeText(typeNode?.getText() ?? ''),
    sections: undefined,
  };

  if (!typeNode || !Node.isTypeReference(typeNode)) {
    return snapshot;
  }

  if (typeNode.getTypeName().getText() !== 'GetDeps') {
    return snapshot;
  }

  const [inputType] = typeNode.getTypeArguments();
  if (!inputType || !Node.isTypeLiteral(inputType)) {
    return snapshot;
  }

  snapshot.sections = {
    deps: normalizeText(readTypeLiteralPropertyTypeText(inputType, 'deps')),
    propertiesDeps: normalizeText(
      readTypeLiteralPropertyTypeText(inputType, 'propertiesDeps'),
    ),
    provided: normalizeText(
      readTypeLiteralPropertyTypeText(inputType, 'provided'),
    ),
    missingProvider: normalizeText(
      readTypeLiteralPropertyTypeText(inputType, 'missingProvider'),
    ),
  };

  return snapshot;
}

function getNodeRange(node) {
  return [node.getStart(), node.getEnd()];
}

function getRangeLoc(sourceCode, [start, end]) {
  return {
    start: sourceCode.getLocFromIndex(start),
    end: sourceCode.getLocFromIndex(end),
  };
}

function readTypeLiteralPropertyTypeText(typeLiteral, propertyName) {
  const property = typeLiteral
    .getMembers()
    .find(
      (member) =>
        Node.isPropertySignature(member) && member.getName() === propertyName,
    );

  return property?.getTypeNode()?.getText() ?? '';
}

function getStaleSections(currentSections, refreshedSections) {
  if (!currentSections || !refreshedSections) {
    return [];
  }

  return ['deps', 'propertiesDeps', 'provided', 'missingProvider'].filter(
    (sectionName) =>
      currentSections[sectionName] !== refreshedSections[sectionName],
  );
}

function formatOutOfDateMessage(generatedTypeName, staleSections) {
  if (staleSections.length === 0) {
    return `${generatedTypeName} is out of date. Run ESLint --fix on this file or craft-brand --root <source-root> to refresh it.`;
  }

  return `${generatedTypeName} is out of date for ${formatSectionList(staleSections)}. Run ESLint --fix on this file or craft-brand --root <source-root> to refresh it.`;
}

function formatSectionList(sectionNames) {
  if (sectionNames.length === 1) {
    return sectionNames[0];
  }

  if (sectionNames.length === 2) {
    return `${sectionNames[0]} and ${sectionNames[1]}`;
  }

  return `${sectionNames.slice(0, -1).join(', ')}, and ${
    sectionNames[sectionNames.length - 1]
  }`;
}

function normalizeText(text) {
  const collapsedText = text.replace(/\s+/g, ' ').trim();
  if (collapsedText === '') {
    return '';
  }

  try {
    const sourceFile = ts.createSourceFile(
      '__brand_angular_deps_match__.ts',
      `type __BrandAngularDepsMatch = ${text};`,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const [statement] = sourceFile.statements;

    if (!statement || !ts.isTypeAliasDeclaration(statement)) {
      return collapsedText;
    }

    const transformedType = ts.transform(statement.type, [
      (transformationContext) => (rootNode) =>
        ts.visitNode(rootNode, function visit(node) {
          if (ts.isStringLiteral(node)) {
            return ts.factory.createStringLiteral(node.text);
          }

          return ts.visitEachChild(node, visit, transformationContext);
        }),
    ]);

    const [canonicalTypeNode] = transformedType.transformed;
    const normalizedText = typePrinter
      .printNode(
        ts.EmitHint.Unspecified,
        canonicalTypeNode ?? statement.type,
        sourceFile,
      )
      .replace(/\s+/g, ' ')
      .trim();
    transformedType.dispose();
    return normalizedText;
  } catch {
    return collapsedText;
  }
}
