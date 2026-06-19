/** Generates O(1) DI checks for renderComponent/errorComponent/withErrorComponent. */
module.exports = {
  meta: { type: 'problem', fixable: 'code', schema: [] },
  create(context) {
    const source = context.sourceCode ?? context.getSourceCode();
    return {
      'Program:exit'(program) {
        const text = source.getText();
        if (!/renderComponent|errorComponent|withErrorComponent/.test(text))
          return;

        const cascade = readCascadeContext(text);
        const checks = [];
        walk(program, (node) => {
          if (isCall(node, 'craftRoutes')) {
            collectRouteChecks(node, source, cascade, checks);
          } else if (isCall(node, 'withErrorComponent')) {
            const descriptor = node.arguments[0];
            const deps = readProperty(descriptor, 'componentDeps', source);
            if (deps) {
              checks.push({
                deps,
                names: joinNames(cascade.names, ['CraftGlobalError']),
                values: cascade.values,
                label: 'global error component',
              });
            }
          }
        });

        const missing = checks.filter(
          (check) =>
            !text.includes(
              `RouteExceptionComponentCheckedDI<\n  ${check.deps},`,
            ),
        );
        if (missing.length === 0) return;

        let fixed = ensureImports(text);
        fixed += missing.map(renderCheck).join('');
        context.report({
          node: program,
          message: `${missing.length} exception component(s) must be checked with RouteExceptionComponentCheckedDI.`,
          fix: (fixer) => fixer.replaceTextRange([0, text.length], fixed),
        });
      },
    };
  },
};

function collectRouteChecks(call, source, cascade, checks) {
  const collection = literal(call.arguments[0]);
  const array = call.arguments[1];
  if (!collection || array?.type !== 'ArrayExpression') return;

  for (const entry of array.elements) {
    const routeCall = unwrapRouteCall(entry);
    const def = routeCall ? routeCall.arguments[1] : entry;
    const path = routeCall
      ? literal(routeCall.arguments[0])
      : literal(propertyValue(def, 'path'));
    if (path === undefined || def?.type !== 'ObjectExpression') continue;
    const baseNames = routeNames(collection, path, def);
    if (routeCall && routeCall !== entry) {
      walk(entry.arguments[0], (node) => {
        if (
          node?.type === 'CallExpression' &&
          node.callee?.type === 'Identifier' &&
          node.callee.name.startsWith('provide')
        ) {
          baseNames.push(node.callee.name.slice('provide'.length));
        }
      });
    }

    const routeError = propertyValue(def, 'errorComponent');
    const routeDeps = readProperty(routeError, 'componentDeps', source);
    if (routeDeps) {
      checks.push({
        deps: routeDeps,
        names: joinNames(cascade.names, [...baseNames, 'CraftGlobalError']),
        values: cascade.values,
        label: `error component: ${path}`,
      });
    }

    const handlers = routeCall
      ? routeCall.arguments[2]
      : propertyValue(def, 'handleExceptions');
    if (handlers?.type !== 'ObjectExpression') continue;
    for (const handler of handlers.properties) {
      if (handler.type !== 'Property') continue;
      const code = propertyName(handler);
      walk(handler.value, (node) => {
        if (!isCall(node, 'renderComponent')) return;
        const deps = readProperty(node.arguments[0], 'componentDeps', source);
        if (!deps) return;
        const helper = `${pascal(collection)}${routeBase(path)}${pascal(code)}Exception`;
        checks.push({
          deps,
          names: joinNames(cascade.names, [...baseNames, helper]),
          values: cascade.values,
          label: `render component: ${path}#${code}`,
        });
      });
    }
  }
}

function unwrapRouteCall(entry) {
  if (isCall(entry, 'craftRoute')) return entry;
  if (
    entry?.type === 'CallExpression' &&
    entry.callee?.type === 'MemberExpression' &&
    entry.callee.property?.type === 'Identifier' &&
    entry.callee.property.name === 'withProviders' &&
    isCall(entry.callee.object, 'craftRoute')
  ) {
    return entry.callee.object;
  }
  return undefined;
}

function routeNames(collection, path, def) {
  const prefix = pascal(collection);
  const base = routeBase(path);
  const names = path
    .split('/')
    .filter((x) => x.startsWith(':'))
    .map((x) => `${prefix}${pascal(x.slice(1).replace(/\?$/, ''))}Params`);
  if (propertyValue(def, 'data')) names.push(`${prefix}${base}Data`);
  if (propertyValue(def, 'queryParams'))
    names.push(`${prefix}${base}QueryParams`);
  if (propertyValue(def, 'withLoaderViewTransitionImage'))
    names.push(`${prefix}${base}ViewTransition`);
  const providers = propertyValue(def, 'providers');
  if (providers?.type === 'ArrayExpression') {
    for (const provider of providers.elements) {
      if (
        provider?.type === 'CallExpression' &&
        provider.callee?.type === 'Identifier' &&
        provider.callee.name.startsWith('provide')
      ) {
        names.push(provider.callee.name.slice('provide'.length));
      }
    }
  }
  return names;
}

function renderCheck(check, index) {
  const id = check.label
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .map(pascal)
    .join('');
  return `\n\ntype _Check${id}${index ?? ''}DI = RouteExceptionComponentCheckedDI<\n  ${check.deps},\n  ${check.names || 'never'},\n  ${check.values},\n  '${check.label}',\n>;\ntype _CanRun${id}${index ?? ''} = CanRun<_Check${id}${index ?? ''}DI>;`;
}

function readCascadeContext(text) {
  const match = text.match(
    /ValidateCascadeRoutesFile<\s*([^,]+),\s*([^,]+),\s*typeof\s+\w+\s*>/m,
  );
  return {
    names: match?.[1]?.trim() ?? 'never',
    values: match?.[2]?.trim() ?? 'never',
  };
}

function joinNames(parent, names) {
  return (
    [parent === 'never' ? '' : parent, ...names.map((name) => `'${name}'`)]
      .filter(Boolean)
      .join(' | ') || 'never'
  );
}

function ensureImports(text) {
  const names = ['CanRun', 'RouteExceptionComponentCheckedDI'];
  const match = text.match(
    /import\s*\{([\s\S]*?)\}\s*from\s*(['"]@craft-ng\/core['"])/,
  );
  if (!match)
    return `import type { ${names.join(', ')} } from '@craft-ng/core';\n${text}`;
  const missing = names.filter(
    (name) => !new RegExp(`\\b${name}\\b`).test(match[1]),
  );
  if (!missing.length) return text;
  return text.replace(
    match[0],
    `import {${match[1].trimEnd()},\n  type ${missing.join(',\n  type ')},\n} from ${match[2]}`,
  );
}

function readProperty(node, name, source) {
  const value = propertyValue(node, name);
  return value ? source.getText(value) : undefined;
}
function propertyValue(node, name) {
  if (node?.type !== 'ObjectExpression') return undefined;
  return node.properties.find(
    (p) => p.type === 'Property' && propertyName(p) === name,
  )?.value;
}
function propertyName(property) {
  return property.key?.type === 'Identifier'
    ? property.key.name
    : (literal(property.key) ?? '');
}
function literal(node) {
  return node?.type === 'Literal'
    ? node.value
    : node?.type === 'StringLiteral'
      ? node.value
      : undefined;
}
function isCall(node, name) {
  return (
    node?.type === 'CallExpression' &&
    node.callee?.type === 'Identifier' &&
    node.callee.name === name
  );
}
function pascal(value) {
  return String(value)
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map(
      (x) =>
        x[0].toUpperCase() +
        (x === x.toUpperCase() ? x.slice(1).toLowerCase() : x.slice(1)),
    )
    .join('');
}
function routeBase(path) {
  return (
    String(path)
      .split('/')
      .filter(Boolean)
      .map((x) => pascal(x.replace(/^:/, '').replace(/\?$/, '')))
      .join('') || 'Root'
  );
}
function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent' || key === 'range' || key === 'loc') continue;
    if (Array.isArray(value)) value.forEach((child) => walk(child, visit));
    else if (
      value &&
      typeof value === 'object' &&
      typeof value.type === 'string'
    )
      walk(value, visit);
  }
}
