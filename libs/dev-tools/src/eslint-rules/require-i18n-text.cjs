'use strict';

const { parseHyperscriptCall, property } = require('./hyperscript-walk.cjs');

// These are the positions where a literal becomes text that a user can read.
// Keep the list deliberately small: business values and technical strings are
// not translations, and the rule must not turn into a ban on string literals.
const TEXT_HELPERS = new Set([
  'heading',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'label',
  'button',
  'a',
  'option',
  'span',
  'strong',
  'small',
  'legend',
  'figcaption',
  'caption',
  'input',
  'textarea',
  'select',
]);

const TEXT_ATTRIBUTES = new Set(['placeholder', 'aria-label', 'title']);
// Shared view models often prepare copy before a component renders it. These
// keys mark the small set of object fields that carry presentation text.
const DISPLAY_TEXT_PROPERTIES = new Set([
  'label',
  'kind',
  'hint',
  'text',
  'meta',
  'description',
]);

// Copy has letters. A separator (`' '`, `' — '`, `':'`) is glue between values,
// not something a translator would ever be handed, and reporting it would only
// teach people to silence the rule.
const CARRIES_COPY = /\p{L}/u;

function carriesCopy(text) {
  return typeof text === 'string' && CARRIES_COPY.test(text);
}

function isDisplayTextProperty(property) {
  if (property.computed) return false;
  const key =
    property.key.type === 'Identifier'
      ? property.key.name
      : property.key.type === 'Literal'
        ? String(property.key.value)
        : undefined;
  return key !== undefined && DISPLAY_TEXT_PROPERTIES.has(key);
}

// `kind: 'transport'` tags data; copy has spaces or capitals. A label table
// read through `kind` is still followed: only a bare token literal is skipped.
function isDiscriminantKind(property) {
  const key =
    property.key.type === 'Identifier'
      ? property.key.name
      : String(property.key.value);
  return (
    key === 'kind' &&
    property.value.type === 'Literal' &&
    typeof property.value.value === 'string' &&
    /^[a-z][a-z0-9-]*$/.test(property.value.value)
  );
}

// The catalog's own definitions (`defineToken({ kind: 'text' })`) describe
// messages; they are not copy waiting to be translated.
const I18N_DEFINITIONS = new Set(['defineToken', 'defineCatalog', 'defineLocale']);
function isInsideI18nDefinition(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (
      current.type === 'CallExpression' &&
      current.callee.type === 'Identifier' &&
      I18N_DEFINITIONS.has(current.callee.name)
    ) {
      return true;
    }
  }
  return false;
}

function isInsideTranslationCall(node) {
  let current = node.parent;
  while (current) {
    if (
      current.type === 'CallExpression' &&
      current.callee.type === 'MemberExpression' &&
      !current.callee.computed &&
      current.callee.object.type === 'Identifier' &&
      current.callee.object.name === 'i18n' &&
      current.callee.property.type === 'Identifier' &&
      current.callee.property.name === 't'
    ) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

/**
 * Walks a visible position and reports every literal that is copy — including
 * the ones sitting next to a translated value.
 *
 * It descends only through the shapes that keep text *in place* on screen
 * (concatenation, ternary, fallback, list, template text). A call is a value
 * the application supplies, so `i18n.t('key')` is accepted and its key is never
 * mistaken for copy; a function child stays the application's business too.
 */
function reportCopyLiterals(node, report, depth = 0, resolve = () => undefined) {
  if (!node || depth > 16) return;
  switch (node.type) {
    case 'Literal':
      if (carriesCopy(node.value)) report(node);
      return;
    case 'TemplateLiteral':
      // `${…}` holes are values; the text around them is copy.
      if (node.quasis.some((quasi) => carriesCopy(quasi.value.cooked)))
        report(node);
      return;
    case 'BinaryExpression':
      if (node.operator !== '+') return;
      reportCopyLiterals(node.left, report, depth + 1, resolve);
      reportCopyLiterals(node.right, report, depth + 1, resolve);
      return;
    case 'ConditionalExpression':
      reportCopyLiterals(node.consequent, report, depth + 1, resolve);
      reportCopyLiterals(node.alternate, report, depth + 1, resolve);
      return;
    case 'LogicalExpression':
      reportCopyLiterals(node.left, report, depth + 1, resolve);
      reportCopyLiterals(node.right, report, depth + 1, resolve);
      return;
    case 'ArrayExpression':
      for (const element of node.elements)
        reportCopyLiterals(element, report, depth + 1, resolve);
      return;
    case 'SpreadElement':
      reportCopyLiterals(node.argument, report, depth + 1, resolve);
      return;
    case 'ObjectExpression': {
      // A view-model row names its copy (`label`, `text`…); its other fields
      // are data (`side: 'baseline'`). A label table has no such field: every
      // value is copy.
      const entries = node.properties.filter((entry) => entry.type === 'Property');
      const displayEntries = entries.filter(isDisplayTextProperty);
      for (const entry of displayEntries.length > 0 ? displayEntries : entries)
        reportCopyLiterals(entry.value, report, depth + 1, resolve);
      return;
    }
    case 'MemberExpression':
      // A presentation field may come from a local label table, such as
      // `KIND_LABEL[entry.kind]`. Follow the table, not the business value.
      reportCopyLiterals(node.object, report, depth + 1, resolve);
      return;
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
      // Craft accepts generator children which render a value. Inspect only
      // explicit returns: event handlers and other callback implementation
      // details are not user-facing copy positions.
      if (node.body.type !== 'BlockStatement') {
        reportCopyLiterals(node.body, report, depth + 1, resolve);
        return;
      }
      for (const statement of node.body.body) {
        if (statement.type === 'ReturnStatement')
          reportCopyLiterals(statement.argument, report, depth + 1, resolve);
      }
      return;
    case 'Identifier':
    case 'CallExpression': {
      // Text summaries are often built as `[...].join(' · ')`; inspect the
      // parts while leaving the separator alone.
      if (
        node.type === 'CallExpression' &&
        node.callee.type === 'MemberExpression' &&
        !node.callee.computed &&
        node.callee.property.type === 'Identifier' &&
        node.callee.property.name === 'join'
      ) {
        reportCopyLiterals(node.callee.object, report, depth + 1, resolve);
        return;
      }
      const target = resolve(node);
      if (!target) {
        // Imported text-producing helpers cannot be followed into their
        // module by this syntax-only rule. Flag the opaque boundary when its
        // name declares that it returns user-facing copy.
        if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && /(?:label|text|summary|describe)/i.test(node.callee.name)) report(node);
        return;
      }
      if (
        ![
          'CallExpression',
          'FunctionDeclaration',
          'FunctionExpression',
          'ArrowFunctionExpression',
        ].includes(target.type)
      ) {
        reportCopyLiterals(target, report, depth + 1, resolve);
        return;
      }
      const returned = [];
      const collect = (part) => {
        if (!part || typeof part.type !== 'string') return;
        if (part !== target && (part.type === 'FunctionExpression' || part.type === 'ArrowFunctionExpression')) return;
        if (part.type === 'ReturnStatement') {
          if (part.argument) returned.push(part.argument);
          return;
        }
        for (const [key, value] of Object.entries(part)) {
          if (['parent', 'loc', 'range', 'tokens', 'comments'].includes(key)) continue;
          if (Array.isArray(value)) value.forEach(collect);
          else if (value && typeof value === 'object') collect(value);
        }
      };
      collect(target);
      for (const expression of returned) reportCopyLiterals(expression, report, depth + 1, resolve);
      return;
    }
    default:
      return;
  }
}

function isIgnoredFile(filename) {
  const normalized = filename.replaceAll('\\', '/');
  return (
    normalized.includes('/src/i18n/') ||
    normalized.includes('/server/') ||
    normalized.endsWith('.fn-serveur.ts') ||
    normalized.endsWith('.server.ts') ||
    normalized.includes('/test/') ||
    normalized.includes('/tests/') ||
    normalized.endsWith('.spec.ts') ||
    normalized.endsWith('.test.ts')
  );
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require user-visible Craft hyperscript text and labels to come from the typed i18n runtime.',
      url: 'https://craft-ts.github.io/craft/guide/i18n/',
    },
    schema: [],
    messages: {
      literal:
        'Visible text must come from i18n.t(...) (or a translation helper). Move this literal to the i18n catalogue; dynamic business values remain allowed.',
      attribute:
        'The {{attribute}} value must come from i18n.t(...) (or a translation helper). Move this user-visible string to the i18n catalogue.',
    },
  },
  create(context) {
    // `context.getFilename()` was removed in ESLint 10; `context.filename` is
    // the supported reader and already exists in 9.
    if (isIgnoredFile(context.filename ?? context.getFilename())) return {};
    const reported = new Set();
    const reportLiteral = (node, messageId = 'literal', data) => {
      if (reported.has(node)) return;
      reported.add(node);
      context.report({ node, messageId, ...(data ? { data } : {}) });
    };

    const resolve = (node) => {
      if (node.type === 'CallExpression') {
        if (node.callee.type === 'Identifier' && node.callee.name === 'craftComputed') {
          return node.arguments.find((argument) => argument.type === 'ArrowFunctionExpression' || argument.type === 'FunctionExpression');
        }
        if (node.callee.type !== 'Identifier' || node.callee.name === 'i18n') return undefined;
        const scope = context.sourceCode.getScope(node);
        let current = scope;
        while (current) {
          const variable = current.set.get(node.callee.name);
          const def = variable && variable.defs[0];
          if (def) {
            const target = def.node.type === 'FunctionDeclaration' ? def.node : def.node.init;
            return target && ['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression'].includes(target.type) ? target : undefined;
          }
          current = current.upper;
        }
        return undefined;
      }
      const scope = context.sourceCode.getScope(node);
      let current = scope;
      while (current) {
        const variable = current.set.get(node.name);
        const def = variable && variable.defs[0];
        if (def) {
          const target = def.node.type === 'FunctionDeclaration' ? def.node : def.node.init;
          return target;
        }
        current = current.upper;
      }
      return undefined;
    };
    return {
      CallExpression(node) {
        if (node.callee.type === 'Identifier' && node.callee.name === 'craftComputed') {
          const compute = node.arguments.find((argument) => argument.type === 'ArrowFunctionExpression' || argument.type === 'FunctionExpression');
          if (compute) reportCopyLiterals(compute, reportLiteral, 0, resolve);
        }
        const call = parseHyperscriptCall(node);
        if (!call || !call.tag || !TEXT_HELPERS.has(call.tag)) return;

        for (const attribute of TEXT_ATTRIBUTES) {
          const entry = property(call.props, attribute);
          if (!entry) continue;
          reportCopyLiterals(entry.value, (node) =>
            reportLiteral(node, 'attribute', { attribute }),
          );
        }

        // A function, identifier, member expression or translation call is a
        // value supplied by the application. It is intentionally accepted.
        reportCopyLiterals(call.children, reportLiteral, 0, resolve);
      },
      Property(node) {
        if (
          node.computed ||
          isInsideTranslationCall(node) ||
          !((node.key.type === 'Identifier' &&
            DISPLAY_TEXT_PROPERTIES.has(node.key.name)) ||
            (node.key.type === 'Literal' &&
              DISPLAY_TEXT_PROPERTIES.has(String(node.key.value))))
        ) {
          return;
        }
        if (isDiscriminantKind(node) || isInsideI18nDefinition(node)) return;
        // The i18n rule also applies when a feature prepares visible copy in a
        // plain view-model object before the component template consumes it.
        reportCopyLiterals(
          node.value,
          reportLiteral,
          0,
          resolve,
        );
      },
    };
  },
};
