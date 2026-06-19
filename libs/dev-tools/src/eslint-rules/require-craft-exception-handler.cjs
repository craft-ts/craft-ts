/** Enforces craftExceptionHandler(function* (...) {}) in craftRoute() handler maps. */
module.exports = {
  meta: {
    type: 'problem',
    fixable: 'code',
    schema: [],
    messages: {
      wrap: 'Route exception handlers must use craftExceptionHandler(function* (...) {}).',
      redirect:
        'Raw redirect(...) is ambiguous: migrate internal routes to redirectTo(...) and opaque URLs to redirectUrl(...).',
    },
  },
  create(context) {
    const source = context.sourceCode ?? context.getSourceCode();

    return {
      'Program:exit'(program) {
        const issues = [];

        for (const statement of program.body) {
          walk(statement, (node) => {
            if (
              node.type !== 'CallExpression' ||
              node.callee?.type !== 'Identifier' ||
              node.callee.name !== 'craftRoute' ||
              node.arguments.length < 3
            ) {
              return;
            }

            const handlers = node.arguments[2];
            if (handlers?.type !== 'ObjectExpression') return;

            for (const property of handlers.properties) {
              if (property.type !== 'Property') continue;
              const value = property.value;
              if (
                value.type === 'CallExpression' &&
                value.callee?.type === 'Identifier' &&
                value.callee.name === 'craftExceptionHandler'
              ) {
                continue;
              }

              if (
                value.type !== 'ArrowFunctionExpression' &&
                value.type !== 'FunctionExpression'
              ) {
                issues.push({ node: value, manual: true });
                continue;
              }

              const text = source.getText(value);
              issues.push({
                node: value,
                manual: /\bredirect\s*\(/.test(text),
                replacement: wrapHandler(value, source),
              });
            }
          });
        }

        if (issues.length === 0) return;
        const manual = issues.filter((issue) => issue.manual);
        if (manual.length > 0) {
          for (const issue of manual) {
            context.report({ node: issue.node, messageId: 'redirect' });
          }
        }

        const fixable = issues.filter((item) => !item.manual);
        if (fixable.length === 0) return;
        const original = source.getText();
        const replacements = fixable
          .map((issue) => ({
            range: issue.node.range,
            text: issue.replacement,
          }))
          .sort((a, b) => b.range[0] - a.range[0]);
        let fixed = original;
        for (const replacement of replacements) {
          fixed =
            fixed.slice(0, replacement.range[0]) +
            replacement.text +
            fixed.slice(replacement.range[1]);
        }
        fixed = ensureImport(fixed);

        context.report({
          node: fixable[0].node,
          messageId: 'wrap',
          fix: (fixer) => fixer.replaceTextRange([0, original.length], fixed),
        });
      },
    };
  },
};

function wrapHandler(node, source) {
  const params = node.params.map((param) => source.getText(param)).join(', ');
  const body =
    node.body.type === 'BlockStatement'
      ? source.getText(node.body)
      : `{ return ${source.getText(node.body)}; }`;
  return `craftExceptionHandler(function* (${params}) ${body})`;
}

function ensureImport(text) {
  if (
    /\bcraftExceptionHandler\b/.test(
      text.match(/import[\s\S]*?from\s+['"]@craft-ng\/core['"]/g)?.join('\n') ??
        '',
    )
  ) {
    return text;
  }
  const pattern = /import\s*\{([\s\S]*?)\}\s*from\s*(['"]@craft-ng\/core['"])/;
  if (pattern.test(text)) {
    return text.replace(pattern, (_all, names, source) => {
      const separator = names.includes('\n') ? '\n  ' : ' ';
      return `import {${names.trimEnd()},${separator}craftExceptionHandler\n} from ${source}`;
    });
  }
  return `import { craftExceptionHandler } from '@craft-ng/core';\n${text}`;
}

function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent' || key === 'range' || key === 'loc') continue;
    if (Array.isArray(value)) {
      for (const child of value) walk(child, visit);
    } else if (
      value &&
      typeof value === 'object' &&
      typeof value.type === 'string'
    ) {
      walk(value, visit);
    }
  }
}
