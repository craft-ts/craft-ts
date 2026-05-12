const ANGULAR_SIGNAL_FORMS_MODULE = '@angular/forms/signals';
const BANNED_SYMBOLS = new Set(['form', 'FormField']);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow Angular signal forms (form, FormField) usage. Use Craft form primitives (insertForm, CraftField) instead.',
    },
    schema: [],
  },
  create(context) {
    const signalFormsNamespaceImports = new Set();
    const signalFormsLocalSymbols = new Map();

    return {
      ImportDeclaration(node) {
        const sourceValue = node.source.value;
        if (typeof sourceValue !== 'string') {
          return;
        }

        const isSignalFormsModule = sourceValue === ANGULAR_SIGNAL_FORMS_MODULE;

        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportNamespaceSpecifier') {
            if (isSignalFormsModule) {
              signalFormsNamespaceImports.add(specifier.local.name);
              context.report({
                node: specifier,
                message: signalFormsMessage(),
              });
            }
            continue;
          }

          if (specifier.type === 'ImportDefaultSpecifier') {
            if (isSignalFormsModule) {
              context.report({
                node: specifier,
                message: signalFormsMessage(),
              });
            }
            continue;
          }

          if (
            specifier.type === 'ImportSpecifier' &&
            specifier.imported.type === 'Identifier'
          ) {
            const importedName = specifier.imported.name;
            if (
              isSignalFormsModule ||
              (isAngularFormsModule(sourceValue) &&
                BANNED_SYMBOLS.has(importedName))
            ) {
              signalFormsLocalSymbols.set(specifier.local.name, importedName);
              context.report({
                node: specifier,
                message: signalFormsMessage(importedName),
              });
            }
          }
        }
      },
      CallExpression(node) {
        const callee = node.callee;

        if (
          callee.type === 'Identifier' &&
          signalFormsLocalSymbols.has(callee.name)
        ) {
          context.report({
            node: callee,
            message: signalFormsMessage(signalFormsLocalSymbols.get(callee.name)),
          });
          return;
        }

        if (
          callee.type === 'MemberExpression' &&
          !callee.computed &&
          callee.object.type === 'Identifier' &&
          signalFormsNamespaceImports.has(callee.object.name) &&
          callee.property.type === 'Identifier' &&
          BANNED_SYMBOLS.has(callee.property.name)
        ) {
          context.report({
            node: callee.property,
            message: signalFormsMessage(callee.property.name),
          });
        }
      },
    };
  },
};

function isAngularFormsModule(sourceValue) {
  return (
    sourceValue === '@angular/forms' ||
    sourceValue.startsWith('@angular/forms/')
  );
}

function signalFormsMessage(symbolName) {
  const subject = symbolName ? `"${symbolName}"` : 'Angular signal forms';
  return `${subject} from @angular/forms/signals is forbidden. Use Craft form primitives (insertForm, CraftField) instead.`;
}
