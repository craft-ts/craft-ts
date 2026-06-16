const fs = require('node:fs');
const path = require('node:path');
const { IndentationText, Project, QuoteKind, SyntaxKind } = require('ts-morph');

const projectCache = new Map();

const ANGULAR_ROUTER_MODULE = '@angular/router';
const CRAFT_CORE_MODULE = '@craft-ng/core';
const ANGULAR_SYMBOL = 'RouterOutlet';
const CRAFT_SYMBOL = 'CraftRouterOutlet';
const ANGULAR_TAG = 'router-outlet';
const CRAFT_TAG = 'craft-router-outlet';

// Match `<router-outlet`, `</router-outlet`, but NOT `<craft-router-outlet`
// (the `(?<![\w-])` guard stops the `-router-outlet` suffix from matching).
const TAG_PATTERN = /<(\/?)(?<![\w-])router-outlet\b/g;

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow Angular RouterOutlet / <router-outlet>. Use CraftRouterOutlet / <craft-router-outlet> (the non-blocking outlet) instead.',
    },
    fixable: 'code',
    schema: [],
    messages: {
      forbidden:
        'Use CraftRouterOutlet / <craft-router-outlet> instead of Angular RouterOutlet / <router-outlet>.',
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
        const hasImport = text.includes(ANGULAR_SYMBOL);
        const hasTag = TAG_PATTERN.test(text);
        TAG_PATTERN.lastIndex = 0;
        if (!hasImport && !hasTag) {
          return;
        }

        const sourceFile = getProjectSourceFile(
          getProject(getCwd(context)),
          filePath,
          text,
        );

        const importChanged = rewriteAngularRouterOutletImport(sourceFile);

        // Rewrite the inline template tag(s) on the post-import-edit text so the
        // single whole-file fix carries both changes.
        let fixedText = sourceFile.getFullText();
        const tagChanged = TAG_PATTERN.test(fixedText);
        TAG_PATTERN.lastIndex = 0;
        if (tagChanged) {
          fixedText = fixedText.replace(TAG_PATTERN, `<$1${CRAFT_TAG}`);
        }

        if ((!importChanged && !tagChanged) || fixedText === text) {
          return;
        }

        context.report({
          loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
          messageId: 'forbidden',
          fix(fixer) {
            return fixer.replaceTextRange([0, text.length], fixedText);
          },
        });
      },
    };
  },
};

// Removes `RouterOutlet` from the `@angular/router` import, renames every
// `RouterOutlet` reference to `CraftRouterOutlet`, and ensures the craft import.
// Returns whether anything changed.
function rewriteAngularRouterOutletImport(sourceFile) {
  const routerImport = sourceFile
    .getImportDeclarations()
    .find((imp) => imp.getModuleSpecifierValue() === ANGULAR_ROUTER_MODULE);

  const routerOutletSpecifier = routerImport
    ?.getNamedImports()
    .find((named) => named.getName() === ANGULAR_SYMBOL);

  if (!routerOutletSpecifier) {
    return false;
  }

  // Drop the named import (and the whole declaration if it becomes empty).
  routerOutletSpecifier.remove();
  if (
    routerImport.getNamedImports().length === 0 &&
    !routerImport.getDefaultImport() &&
    !routerImport.getNamespaceImport()
  ) {
    routerImport.remove();
  }

  // Rename remaining `RouterOutlet` references (imports array, GenDeps, …).
  for (const identifier of sourceFile.getDescendantsOfKind(
    SyntaxKind.Identifier,
  )) {
    if (!identifier.wasForgotten() && identifier.getText() === ANGULAR_SYMBOL) {
      identifier.replaceWithText(CRAFT_SYMBOL);
    }
  }

  ensureCraftImport(sourceFile);
  return true;
}

function ensureCraftImport(sourceFile) {
  const craftImport = sourceFile
    .getImportDeclarations()
    .find((imp) => imp.getModuleSpecifierValue() === CRAFT_CORE_MODULE);

  if (craftImport) {
    const alreadyImported = craftImport
      .getNamedImports()
      .some((named) => named.getName() === CRAFT_SYMBOL);
    if (!alreadyImported) {
      craftImport.addNamedImport(CRAFT_SYMBOL);
    }
  } else {
    sourceFile.addImportDeclaration({
      moduleSpecifier: CRAFT_CORE_MODULE,
      namedImports: [CRAFT_SYMBOL],
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
