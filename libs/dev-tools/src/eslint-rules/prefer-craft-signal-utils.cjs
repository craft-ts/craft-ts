const ANGULAR_CORE = '@angular/core';
const CRAFT_CORE = '@craft-ng/core';

/**
 * Factory building a rule that forbids a primitive imported from `@angular/core`
 * (`signal`, `computed`, `effect`) in favor of its craft counterpart
 * (`state`, `craftComputed`, `craftEffect`).
 *
 * The autofix:
 *  - renames the call expression callee,
 *  - inserts the derived name as the first argument when the craft replacement
 *    requires one (`needsName`) and a name can be derived from the declaration,
 *  - rewrites the import: drops the forbidden specifier from `@angular/core` and
 *    adds the replacement import from `@craft-ng/core` (merging into an existing
 *    `@craft-ng/core` import when present).
 *
 * Namespace usages (`import * as core from '@angular/core'; core.signal()`) are
 * reported without an autofix since they cannot be migrated by a local rename.
 */
function createPreferCraftSignalRule({
  angularName,
  craftName,
  needsName,
  messageId,
  message,
  description,
}) {
  return {
    meta: {
      type: 'problem',
      docs: { description },
      fixable: 'code',
      schema: [],
      messages: { [messageId]: message },
    },
    create(context) {
      const sourceCode = context.sourceCode ?? context.getSourceCode();
      const namespaceImports = new Set();
      const usages = [];
      let importNode = null;
      let importSpecifier = null;

      return {
        ImportDeclaration(node) {
          if (node.source.value !== ANGULAR_CORE) {
            return;
          }

          for (const specifier of node.specifiers) {
            if (
              specifier.type === 'ImportSpecifier' &&
              specifier.imported.type === 'Identifier' &&
              specifier.imported.name === angularName
            ) {
              importNode = node;
              importSpecifier = specifier;
            } else if (specifier.type === 'ImportNamespaceSpecifier') {
              namespaceImports.add(specifier.local.name);
            }
          }
        },
        CallExpression(node) {
          const callee = node.callee;

          // Namespace usage (`core.signal()`) cannot be migrated by a local
          // rename, so report it as-is without a fix.
          if (
            callee.type === 'MemberExpression' &&
            !callee.computed &&
            callee.object.type === 'Identifier' &&
            namespaceImports.has(callee.object.name) &&
            callee.property.type === 'Identifier' &&
            callee.property.name === angularName
          ) {
            context.report({ node: callee.property, messageId });
            return;
          }

          if (
            callee.type !== 'Identifier' ||
            callee.name !== angularName ||
            !isAngularImport(angularName, sourceCode, node)
          ) {
            return;
          }

          const declaredName = needsName ? getDeclaredName(node) : undefined;
          usages.push({
            callNode: node,
            callee,
            declaredName,
            fixable: !needsName || Boolean(declaredName),
          });
        },
        'Program:exit'() {
          if (!importSpecifier) {
            return;
          }

          // Autofix is all-or-nothing per file: only rewrite the import and
          // rename usages when every usage can be safely renamed. Otherwise a
          // partial fix would leave the renamed import referencing a callee
          // that was never updated (or vice versa).
          const canAutofix = usages.every((usage) => usage.fixable);

          context.report({
            node: importSpecifier,
            messageId,
            fix: canAutofix
              ? (fixer) =>
                  fixImport(
                    fixer,
                    sourceCode,
                    importNode,
                    importSpecifier,
                    craftName,
                  )
              : undefined,
          });

          for (const usage of usages) {
            context.report({
              node: usage.callee,
              messageId,
              fix: canAutofix
                ? (fixer) => fixUsage(fixer, sourceCode, usage, craftName, needsName)
                : undefined,
            });
          }
        },
      };
    },
  };
}

function fixUsage(fixer, sourceCode, usage, craftName, needsName) {
  const fixes = [fixer.replaceText(usage.callee, craftName)];

  if (needsName) {
    const openParen = sourceCode.getTokenAfter(
      usage.callee,
      (token) => token.type === 'Punctuator' && token.value === '(',
    );
    if (!openParen) {
      return null;
    }
    const separator = usage.callNode.arguments.length > 0 ? ', ' : '';
    fixes.push(
      fixer.insertTextAfter(openParen, `'${usage.declaredName}'${separator}`),
    );
  }

  return fixes;
}

function fixImport(fixer, sourceCode, importNode, specifier, craftName) {
  const namedSpecifiers = importNode.specifiers.filter(
    (s) => s.type === 'ImportSpecifier',
  );
  const hasOtherKind = importNode.specifiers.some(
    (s) => s.type !== 'ImportSpecifier',
  );
  const removesWholeImport = namedSpecifiers.length === 1 && !hasOtherKind;

  const craftImport = findCraftImport(sourceCode);
  const alreadyImported =
    craftImport &&
    craftImport.specifiers.some(
      (s) =>
        s.type === 'ImportSpecifier' &&
        s.imported.type === 'Identifier' &&
        s.imported.name === craftName,
    );

  // When the forbidden specifier is the only thing imported from @angular/core
  // and there is no existing @craft-ng/core import to merge into, swap the
  // whole declaration in place to avoid an insert that overlaps the removal.
  if (removesWholeImport && !craftImport) {
    return fixer.replaceText(
      importNode,
      `import { ${craftName} } from '${CRAFT_CORE}';`,
    );
  }

  const fixes = [removeSpecifier(fixer, sourceCode, importNode, specifier, removesWholeImport)];

  if (craftImport && !alreadyImported) {
    const lastSpecifier =
      craftImport.specifiers[craftImport.specifiers.length - 1];
    fixes.push(fixer.insertTextAfter(lastSpecifier, `, ${craftName}`));
  } else if (!craftImport) {
    fixes.push(
      fixer.insertTextAfter(
        importNode,
        `\nimport { ${craftName} } from '${CRAFT_CORE}';`,
      ),
    );
  }

  return fixes;
}

function removeSpecifier(fixer, sourceCode, importNode, specifier, removesWholeImport) {
  if (removesWholeImport) {
    const text = sourceCode.getText();
    let end = importNode.range[1];
    if (text[end] === '\n') {
      end += 1;
    }
    return fixer.removeRange([importNode.range[0], end]);
  }

  const tokenAfter = sourceCode.getTokenAfter(specifier);
  if (tokenAfter && tokenAfter.value === ',') {
    return fixer.removeRange([specifier.range[0], tokenAfter.range[1]]);
  }

  const tokenBefore = sourceCode.getTokenBefore(specifier);
  if (tokenBefore && tokenBefore.value === ',') {
    return fixer.removeRange([tokenBefore.range[0], specifier.range[1]]);
  }

  return fixer.remove(specifier);
}

function findCraftImport(sourceCode) {
  return sourceCode.ast.body.find(
    (statement) =>
      statement.type === 'ImportDeclaration' &&
      statement.source.value === CRAFT_CORE &&
      statement.importKind !== 'type' &&
      statement.specifiers.some((s) => s.type === 'ImportSpecifier'),
  );
}

function getDeclaredName(callNode) {
  const parent = callNode.parent;
  if (!parent) return undefined;

  if (
    parent.type === 'VariableDeclarator' &&
    parent.init === callNode &&
    parent.id.type === 'Identifier'
  ) {
    return parent.id.name;
  }

  if (
    parent.type === 'PropertyDefinition' &&
    parent.value === callNode &&
    !parent.computed &&
    parent.key.type === 'Identifier'
  ) {
    return parent.key.name;
  }

  return undefined;
}

function isAngularImport(angularName, sourceCode, node) {
  const getScope = sourceCode.getScope
    ? (n) => sourceCode.getScope(n)
    : (n) => sourceCode.scopeManager.acquire(n) ?? sourceCode.scopeManager.globalScope;

  let currentScope = getScope(node);
  while (currentScope) {
    for (const variable of currentScope.variables) {
      if (variable.name !== angularName) {
        continue;
      }
      for (const def of variable.defs) {
        if (
          def.type === 'ImportBinding' &&
          def.parent &&
          def.parent.source &&
          def.parent.source.value === ANGULAR_CORE
        ) {
          return true;
        }
      }
    }
    currentScope = currentScope.upper;
  }

  return false;
}

module.exports = { createPreferCraftSignalRule };
