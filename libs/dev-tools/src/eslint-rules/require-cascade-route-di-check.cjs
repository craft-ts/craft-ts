'use strict';

const {
  IndentationText,
  Node,
  Project,
  QuoteKind,
  SyntaxKind,
} = require('ts-morph');

const CRAFT_MODULE = '@craft-ng/core';

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require every craftRoutes collection to have a ValidateCascadeRoutesFile + CanRun DI check in the same file.',
    },
    fixable: 'code',
    schema: [],
  },
  create(context) {
    return {
      'Program:exit'() {
        const sourceCode = context.sourceCode ?? context.getSourceCode();
        const text = sourceCode.getText();
        if (!text.includes('craftRoutes(')) return;

        const project = new Project({
          useInMemoryFileSystem: true,
          manipulationSettings: {
            indentationText: IndentationText.TwoSpaces,
            quoteKind: QuoteKind.Single,
          },
        });
        const sourceFile = project.createSourceFile('/route-file.ts', text);
        const collections = collectCollections(sourceFile);
        if (collections.length === 0) return;

        const cascadeChecks = collectCascadeChecks(sourceFile);
        const canRunChecks = collectCanRunChecks(sourceFile);
        const missing = collections.filter(({ routesName }) => {
          const aliases = cascadeChecks.get(routesName) ?? [];
          return (
            aliases.length === 0 ||
            !aliases.some((name) => canRunChecks.has(name))
          );
        });
        if (missing.length === 0) return;
        const reportLoc = nodeLocation(
          sourceCode,
          missing[0].call.getStart(),
          missing[0].call.getWidth(),
        );

        for (const collection of missing) {
          const suffix = toPascalCase(
            collection.collectionName ||
              collection.routesName.replace(/Routes$/, ''),
          );
          const existingChecks = cascadeChecks.get(collection.routesName) ?? [];
          const checkName =
            existingChecks[0] ??
            uniqueTypeName(sourceFile, `_Check${suffix}DI`);
          const canRunName = uniqueTypeName(sourceFile, `_CanRun${suffix}`);
          if (existingChecks.length === 0) {
            sourceFile.addTypeAlias({
              name: checkName,
              type: `ValidateCascadeRoutesFile<never, Router, typeof ${collection.routesName}>`,
            });
          }
          sourceFile.addTypeAlias({
            name: canRunName,
            type: `CanRun<${checkName}>`,
          });
        }
        if (
          missing.some(
            (collection) => !cascadeChecks.get(collection.routesName)?.length,
          )
        ) {
          ensureNamedImport(
            sourceFile,
            'ValidateCascadeRoutesFile',
            CRAFT_MODULE,
            true,
          );
          ensureNamedImport(sourceFile, 'Router', '@angular/router', true);
        }
        ensureNamedImport(sourceFile, 'CanRun', CRAFT_MODULE, true);
        sourceFile.formatText();

        const fixedText = sourceFile.getFullText();
        context.report({
          loc: reportLoc,
          message: `craftRoutes collection(s) missing a same-file ValidateCascadeRoutesFile + CanRun check: ${missing
            .map((item) => item.routesName)
            .join(', ')}`,
          fix(fixer) {
            return fixer.replaceTextRange([0, text.length], fixedText);
          },
        });
      },
    };
  },
};

function collectCollections(sourceFile) {
  const collections = [];
  for (const call of sourceFile.getDescendantsOfKind(
    SyntaxKind.CallExpression,
  )) {
    if (call.getExpression().getText() !== 'craftRoutes') continue;
    const declaration = call.getFirstAncestorByKind(
      SyntaxKind.VariableDeclaration,
    );
    const binding = declaration?.getNameNode();
    if (!binding || !Node.isObjectBindingPattern(binding)) continue;
    const firstArg = call.getArguments()[0];
    const collectionName = Node.isStringLiteral(firstArg)
      ? firstArg.getLiteralValue()
      : '';
    const expected = collectionName
      ? `${uncapitalize(toPascalCase(collectionName))}Routes`
      : '';
    const routeElements = binding
      .getElements()
      .filter((element) =>
        (
          element.getPropertyNameNode()?.getText() ?? element.getName()
        ).endsWith('Routes'),
      );
    const element =
      routeElements.find(
        (candidate) =>
          (candidate.getPropertyNameNode()?.getText() ??
            candidate.getName()) === expected,
      ) ?? (routeElements.length === 1 ? routeElements[0] : undefined);
    if (!element) continue;
    collections.push({ collectionName, routesName: element.getName(), call });
  }
  return collections;
}

function collectCascadeChecks(sourceFile) {
  const result = new Map();
  for (const alias of sourceFile.getTypeAliases()) {
    const typeNode = alias.getTypeNode();
    if (!typeNode || !Node.isTypeReference(typeNode)) continue;
    if (typeNode.getTypeName().getText() !== 'ValidateCascadeRoutesFile')
      continue;
    const routeType = typeNode.getTypeArguments()[2]?.getText() ?? '';
    const match = /^typeof\s+([A-Za-z_$][\w$]*)$/.exec(routeType.trim());
    if (!match) continue;
    const aliases = result.get(match[1]) ?? [];
    aliases.push(alias.getName());
    result.set(match[1], aliases);
  }
  return result;
}

function collectCanRunChecks(sourceFile) {
  const result = new Set();
  for (const alias of sourceFile.getTypeAliases()) {
    const typeNode = alias.getTypeNode();
    if (!typeNode || !Node.isTypeReference(typeNode)) continue;
    if (typeNode.getTypeName().getText() !== 'CanRun') continue;
    const checked = typeNode.getTypeArguments()[0]?.getText();
    if (checked) result.add(checked);
  }
  return result;
}

function ensureNamedImport(sourceFile, name, moduleSpecifier, typeOnly) {
  const existing = sourceFile
    .getImportDeclarations()
    .find(
      (declaration) =>
        declaration.getModuleSpecifierValue() === moduleSpecifier,
    );
  if (existing) {
    if (!existing.getNamedImports().some((item) => item.getName() === name)) {
      existing.addNamedImport({
        name,
        isTypeOnly: typeOnly && !existing.isTypeOnly(),
      });
    }
    return;
  }
  sourceFile.addImportDeclaration({
    moduleSpecifier,
    isTypeOnly: typeOnly,
    namedImports: [name],
  });
}

function uniqueTypeName(sourceFile, base) {
  let name = base;
  let index = 2;
  while (sourceFile.getTypeAlias(name)) name = `${base}${index++}`;
  return name;
}

function nodeLocation(sourceCode, start, width) {
  const from = sourceCode.getLocFromIndex(start);
  const to = sourceCode.getLocFromIndex(start + width);
  return { start: from, end: to };
}

function toPascalCase(value) {
  return (
    value
      .split(/[^A-Za-z0-9]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('') || 'Routes'
  );
}

function uncapitalize(value) {
  return value.charAt(0).toLowerCase() + value.slice(1);
}
