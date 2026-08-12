const fs = require('node:fs');
const path = require('node:path');

function property(object, name) {
  return object?.type === 'ObjectExpression'
    ? object.properties.find(
        (entry) =>
          entry.type === 'Property' &&
          !entry.computed &&
          ((entry.key.type === 'Identifier' && entry.key.name === name) ||
            (entry.key.type === 'Literal' && entry.key.value === name)),
      )
    : undefined;
}

function staticString(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0]?.value.cooked ?? '';
  }
  if (node?.type === 'ArrayExpression') {
    const values = node.elements.map(staticString);
    return values.every((value) => typeof value === 'string') ? values.join('\n') : undefined;
  }
  return undefined;
}

function resolveImportedCss(context, sourceCode, identifier) {
  const declaration = sourceCode.ast.body.find(
    (entry) =>
      entry.type === 'ImportDeclaration' &&
      entry.specifiers.some((specifier) => specifier.local.name === identifier),
  );
  if (!declaration || typeof declaration.source.value !== 'string') return undefined;
  const filename = context.filename ?? context.getFilename();
  if (!filename || filename === '<input>') return undefined;
  try {
    return fs.readFileSync(path.resolve(path.dirname(filename), declaration.source.value), 'utf8');
  } catch {
    return undefined;
  }
}

function componentInfo(context, sourceCode, node) {
  if (
    node.callee.type !== 'Identifier' ||
    node.callee.name !== 'craftComponent' ||
    node.arguments.length < 2 ||
    node.arguments[1].type !== 'ObjectExpression'
  ) return undefined;
  const name = staticString(node.arguments[0]);
  if (!name) return undefined;
  const meta = node.arguments[1];
  const styles = property(meta, 'styles');
  const stylesUrl = property(meta, 'stylesUrl');
  const cssVars = property(meta, 'cssVars');
  let css;
  let opaque = false;
  let external = false;
  if (styles) {
    css = staticString(styles.value);
    opaque = css === undefined;
  } else if (stylesUrl) {
    external = true;
    css = staticString(stylesUrl.value);
    if (css === undefined && stylesUrl.value.type === 'Identifier') {
      css = resolveImportedCss(context, sourceCode, stylesUrl.value.name);
    }
    opaque = css === undefined;
  }
  const contract = new Set();
  if (cssVars?.value.type === 'ObjectExpression') {
    for (const entry of cssVars.value.properties) {
      if (entry.type !== 'Property') continue;
      const key = entry.key.type === 'Identifier' ? entry.key.name : entry.key.value;
      if (typeof key === 'string') contract.add(key);
    }
  }
  return { name, meta, styles, stylesUrl, cssVars, css, opaque, external, contract };
}

function cssFacts(css = '') {
  const used = new Set([...css.matchAll(/var\(\s*(--[\w-]+)/g)].map((match) => match[1]));
  const fallback = new Set(
    [...css.matchAll(/var\(\s*(--[\w-]+)\s*,/g)].map((match) => match[1]),
  );
  const declared = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]));
  const registered = new Set([...css.matchAll(/@property\s+(--[\w-]+)/g)].map((match) => match[1]));
  registered.forEach((name) => declared.add(name));
  return { used, fallback, declared, registered };
}

function kebab(value) {
  return value
    .replace(/Component$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
}

function prefixes(name) {
  const full = kebab(name);
  const words = full.split('-');
  return new Set([`--${full}-`, `--${words.at(-1)}-`]);
}

module.exports = { componentInfo, cssFacts, kebab, prefixes };

