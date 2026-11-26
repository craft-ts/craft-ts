/**
 * `deferNode(({ withRetry }) => withRetry(import('./x')).then((m) => m.X))`
 * selects the component inside the loader. Written in a template, that
 * `.then` callback is checked after the call around it has fixed its types:
 * the loaded component falls back to a component with no contract, and its
 * services vanish from the parent's DI proof. The loader must return the
 * module, and the export is named with `.pick('X', options)`.
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require deferNode loaders to return the module and name the component export with .pick(...), so the loaded component keeps its dependency contract.',
    },
    fixable: 'code',
    schema: [],
    messages: {
      selectInLoader:
        "Do not select the component inside the deferNode loader with `.then(...)`: in a template, the loaded component loses its type and its services vanish from the parent's DI proof. Return the module and name the export: `deferNode(({ withRetry }) => withRetry(import('./module'))).pick('{{name}}', options)`.",
      selectInLoaderUnknown:
        "Do not select the component inside the deferNode loader with `.then(...)`: in a template, the loaded component loses its type and its services vanish from the parent's DI proof. Return the module and name the export: `deferNode(({ withRetry }) => withRetry(import('./module'))).pick('ExportName', options)`.",
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const deferNodeNames = new Set();

    return {
      ImportDeclaration(node) {
        if (node.source.value !== '@craft-ts/component') return;
        for (const specifier of node.specifiers) {
          if (
            specifier.type === 'ImportSpecifier' &&
            identifierName(specifier.imported) === 'deferNode'
          ) {
            deferNodeNames.add(specifier.local.name);
          }
        }
      },

      CallExpression(node) {
        if (
          node.callee.type !== 'Identifier' ||
          !deferNodeNames.has(node.callee.name)
        ) {
          return;
        }
        const [loader, options, ...rest] = node.arguments;
        if (!isFunction(loader)) return;

        const returned = returnedExpressions(loader);
        const thenCalls = returned
          .map((expression) => moduleThenCall(expression))
          .filter(Boolean);
        if (thenCalls.length === 0) return;

        const names = new Set(thenCalls.map((call) => call.exportName));
        const name = names.size === 1 ? [...names][0] : undefined;
        const fixable =
          name !== undefined &&
          thenCalls.length === returned.length &&
          rest.length === 0 &&
          isPickableOptions(options);

        context.report({
          node: thenCalls[0].node,
          messageId: name === undefined ? 'selectInLoaderUnknown' : 'selectInLoader',
          data: name === undefined ? {} : { name },
          fix: fixable
            ? (fixer) => {
                const text = sourceCode.getText();
                let loaderText = '';
                let cursor = loader.range[0];
                for (const call of thenCalls) {
                  loaderText += text.slice(cursor, call.node.range[0]);
                  loaderText += sourceCode.getText(call.moduleExpression);
                  cursor = call.node.range[1];
                }
                loaderText += text.slice(cursor, loader.range[1]);
                const optionsText = options
                  ? `, ${sourceCode.getText(options)}`
                  : '';
                return fixer.replaceText(
                  node,
                  `${node.callee.name}(${loaderText}).pick('${name}'${optionsText})`,
                );
              }
            : null,
        });
      },
    };
  },
};

function isFunction(node) {
  return (
    node?.type === 'ArrowFunctionExpression' ||
    node?.type === 'FunctionExpression'
  );
}

/** The expressions a loader returns: its expression body, or every `return`. */
function returnedExpressions(loader) {
  if (loader.body.type !== 'BlockStatement') return [loader.body];
  const found = [];
  const visit = (node) => {
    if (!node || typeof node.type !== 'string') return;
    if (node !== loader.body && isFunction(node)) return;
    if (node.type === 'FunctionDeclaration') return;
    if (node.type === 'ReturnStatement') {
      if (node.argument) found.push(node.argument);
      return;
    }
    for (const key of Object.keys(node)) {
      if (key === 'parent') continue;
      const child = node[key];
      if (Array.isArray(child)) child.forEach(visit);
      else if (child && typeof child.type === 'string') visit(child);
    }
  };
  visit(loader.body);
  return found;
}

/**
 * `<module>.then(<select>)` where `<module>` is `import(...)` or a call
 * wrapping one (`withRetry(import(...))`), and `<select>` reads one export.
 * `exportName` is undefined when the selection cannot be read statically.
 */
function moduleThenCall(expression) {
  if (
    expression?.type !== 'CallExpression' ||
    expression.callee.type !== 'MemberExpression' ||
    expression.callee.computed ||
    identifierName(expression.callee.property) !== 'then' ||
    expression.arguments.length !== 1
  ) {
    return undefined;
  }
  const moduleExpression = expression.callee.object;
  if (!isModuleImport(moduleExpression)) return undefined;
  return {
    node: expression,
    moduleExpression,
    exportName: selectedExport(expression.arguments[0]),
  };
}

function isModuleImport(node) {
  if (node?.type === 'ImportExpression') return true;
  return (
    node?.type === 'CallExpression' &&
    node.arguments.length === 1 &&
    node.arguments[0].type === 'ImportExpression'
  );
}

/** `(m) => m.X`, `(m) => m['X']` or `({ X }) => X`. */
function selectedExport(select) {
  if (select?.type !== 'ArrowFunctionExpression' || select.params.length !== 1) {
    return undefined;
  }
  const [param] = select.params;
  const body = select.body;
  if (param.type === 'Identifier' && body.type === 'MemberExpression') {
    if (body.object.type !== 'Identifier' || body.object.name !== param.name) {
      return undefined;
    }
    if (!body.computed) return identifierName(body.property);
    return body.property.type === 'Literal' &&
      typeof body.property.value === 'string'
      ? body.property.value
      : undefined;
  }
  if (
    param.type === 'ObjectPattern' &&
    param.properties.length === 1 &&
    param.properties[0].type === 'Property' &&
    !param.properties[0].computed &&
    param.properties[0].value.type === 'Identifier' &&
    body.type === 'Identifier' &&
    body.name === param.properties[0].value.name
  ) {
    return identifierName(param.properties[0].key);
  }
  return undefined;
}

/**
 * `.pick(name, options)` takes the same options as before, minus `resolve`
 * (which needs the loaded value itself). Anything else is left to a human.
 */
function isPickableOptions(options) {
  if (options === undefined) return true;
  if (options.type !== 'ObjectExpression') return false;
  return options.properties.every(
    (property) =>
      property.type === 'Property' &&
      !property.computed &&
      identifierName(property.key) !== 'resolve' &&
      !(property.key.type === 'Literal' && property.key.value === 'resolve'),
  );
}

function identifierName(node) {
  return node?.type === 'Identifier' ? node.name : undefined;
}
