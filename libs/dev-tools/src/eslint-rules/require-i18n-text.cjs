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

// Lowercase identifier-like `kind` values are discriminants, including
// camelCase driver names. Prose such as `Exception HTTP` remains copy.
function isDiscriminantKind(property) {
  const key =
    property.key.type === 'Identifier'
      ? property.key.name
      : String(property.key.value);
  return (
    key === 'kind' &&
    property.value.type === 'Literal' &&
    typeof property.value.value === 'string' &&
    /^[a-z][a-zA-Z0-9-]*$/.test(property.value.value)
  );
}

function isInsideAxisPoint(node, importedNames, namespaces) {
  for (let current = node.parent; current; current = current.parent) {
    if (current.type !== 'CallExpression') continue;
    const callee = current.callee;
    if (callee.type === 'Identifier' && importedNames.has(callee.name)) {
      return true;
    }
    if (
      callee.type === 'MemberExpression' &&
      !callee.computed &&
      callee.object.type === 'Identifier' &&
      namespaces.has(callee.object.name) &&
      callee.property.type === 'Identifier' &&
      callee.property.name === 'axisPoint'
    ) {
      return true;
    }
  }
  return false;
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

function isInsidePaletteDefinition(node) {
  for (let current = node.parent; current; current = current.parent) {
    if (
      current.type === 'CallExpression' &&
      current.callee.type === 'Identifier' &&
      current.callee.name === 'definePalette'
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

// Every `return` of a followed function, skipping nested callbacks: they are
// that function's implementation details, not its result.
function returnedExpressions(fn) {
  const returned = [];
  const collect = (part) => {
    if (!part || typeof part.type !== 'string') return;
    if (
      part !== fn &&
      (part.type === 'FunctionExpression' ||
        part.type === 'ArrowFunctionExpression' ||
        part.type === 'FunctionDeclaration')
    )
      return;
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
  if (fn.type === 'ArrowFunctionExpression' && fn.body.type !== 'BlockStatement')
    return [fn.body];
  collect(fn.body);
  return returned;
}

const FUNCTION_TYPES = [
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
];

/**
 * Walks a visible position and reports every literal that is copy — including
 * the ones sitting next to a translated value.
 *
 * It descends only through the shapes that keep text *in place* on screen
 * (concatenation, ternary, fallback, list, template text). A call is a value
 * the application supplies, so `i18n.t('key')` is accepted and its key is never
 * mistaken for copy; a function child stays the application's business too.
 *
 * `walk.isTechnical(node)` recognises a value declared with `craftLiteral(...)`.
 * Such a value is accepted where technical values live (a computed's result),
 * and reported through `walk.reportTechnical` when the position is visible
 * text: a technical token is never copy.
 */
function reportCopyLiterals(node, walk, depth = 0) {
  if (!node || depth > 16) return;
  const next = (child, nextWalk = walk) =>
    reportCopyLiterals(child, nextWalk, depth + 1);
  switch (node.type) {
    case 'Literal':
      if (carriesCopy(node.value)) walk.report(node);
      return;
    case 'TemplateLiteral':
      // `${…}` holes are values; the text around them is copy.
      if (node.quasis.some((quasi) => carriesCopy(quasi.value.cooked)))
        walk.report(node);
      return;
    case 'BinaryExpression':
      if (node.operator !== '+') return;
      next(node.left);
      next(node.right);
      return;
    case 'ConditionalExpression':
      next(node.consequent);
      next(node.alternate);
      return;
    case 'LogicalExpression':
      next(node.left);
      next(node.right);
      return;
    case 'ArrayExpression':
      for (const element of node.elements) next(element);
      return;
    case 'SpreadElement':
      next(node.argument);
      return;
    case 'ObjectExpression': {
      // A view-model row names its copy (`label`, `text`…); its other fields
      // are data (`side: 'baseline'`). A label table has no such field: every
      // value is copy.
      const entries = node.properties.filter((entry) => entry.type === 'Property');
      const displayEntries = entries.filter(isDisplayTextProperty);
      for (const entry of displayEntries.length > 0 ? displayEntries : entries)
        next(entry.value);
      return;
    }
    case 'MemberExpression':
      // A presentation field may come from a local label table, such as
      // `KIND_LABEL[entry.kind]`. Follow the table, not the business value.
      next(node.object);
      return;
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
      // Craft accepts generator children which render a value. Inspect only
      // explicit returns: event handlers and other callback implementation
      // details are not user-facing copy positions.
      if (node.body.type !== 'BlockStatement') {
        next(node.body);
        return;
      }
      for (const statement of node.body.body) {
        if (statement.type === 'ReturnStatement') next(statement.argument);
      }
      return;
    case 'Identifier':
    case 'CallExpression': {
      // A value declared with craftLiteral(...) is technical by construction.
      if (walk.isTechnical(node)) {
        if (walk.reportTechnical) walk.reportTechnical(node);
        return;
      }
      // Text summaries are often built as `[...].join(' · ')`; inspect the
      // parts while leaving the separator alone.
      if (
        node.type === 'CallExpression' &&
        node.callee.type === 'MemberExpression' &&
        !node.callee.computed &&
        node.callee.property.type === 'Identifier' &&
        node.callee.property.name === 'join'
      ) {
        next(node.callee.object);
        return;
      }
      const target = walk.resolve(node);
      if (!target) {
        // Imported text-producing helpers cannot be followed into their
        // module by this syntax-only rule. Flag the opaque boundary when its
        // name declares that it returns user-facing copy.
        if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && /(?:label|text|summary|describe)/i.test(node.callee.name)) walk.report(node);
        return;
      }
      // In a visible position, a technical value reached through a binding, a
      // helper or a computed is reported where it becomes text.
      let reachesTechnical = false;
      const followed = walk.reportTechnical
        ? { ...walk, reportTechnical: () => { reachesTechnical = true; } }
        : walk;
      if (target.type === 'CallExpression') {
        // `const state = craftComputed(...)`: follow the computation.
        const computation = walk.resolveComputed(target);
        if (computation) {
          for (const expression of returnedExpressions(computation))
            next(expression, followed);
        }
      } else if (FUNCTION_TYPES.includes(target.type)) {
        for (const expression of returnedExpressions(target))
          next(expression, followed);
      } else {
        next(target, followed);
      }
      if (reachesTechnical) walk.reportTechnical(node);
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
        'This literal is treated as user-visible text. If this is text shown to a user, use i18n.t(...). If it is a technical state or discriminant, declare it with craftLiteral(...) and reuse that value. CSS selectors and axisPoint(...) driver metadata stay literal; for common style states, use interaction.focusVisible, ariaChecked.checked, or ariaSelected.selected instead of a custom axisPoint.',
      attribute:
        'The {{attribute}} value must come from i18n.t(...): {{attribute}} is text a user reads or hears, so it belongs in the catalogue. A technical state or discriminant has no place in this attribute.',
      technical:
        'This value is declared as a technical value with craftLiteral(...), but it reaches user-visible text. Text shown to a user must come from i18n.t(...): render a translated message for the technical value instead (for example, one catalogue entry per state).',
      technicalAttribute:
        'The {{attribute}} value comes from craftLiteral(...), but {{attribute}} is text a user reads or hears. It must come from i18n.t(...): render a translated message for the technical value instead (for example, one catalogue entry per state).',
    },
  },
  create(context) {
    // `context.getFilename()` was removed in ESLint 10; `context.filename` is
    // the supported reader and already exists in 9.
    if (isIgnoredFile(context.filename ?? context.getFilename())) return {};
    const reported = new Set();
    const axisPointNames = new Set(['axisPoint']);
    const styleNamespaces = new Set();
    // `craftLiteral` as imported from @craft-ts/core, possibly renamed or
    // reached through a namespace import.
    const craftLiteralNames = new Set();
    const coreNamespaces = new Set();
    const reportLiteral = (node, messageId = 'literal', data) => {
      if (reported.has(node)) return;
      reported.add(node);
      context.report({ node, messageId, ...(data ? { data } : {}) });
    };

    const findDefinition = (identifier) => {
      let current = context.sourceCode.getScope(identifier);
      while (current) {
        const variable = current.set.get(identifier.name);
        if (variable) return variable.defs[0];
        current = current.upper;
      }
      return undefined;
    };

    const isCraftLiteralCall = (node) => {
      if (node.type !== 'CallExpression') return false;
      const callee = node.callee;
      if (callee.type === 'Identifier') return craftLiteralNames.has(callee.name);
      return (
        callee.type === 'MemberExpression' &&
        !callee.computed &&
        callee.object.type === 'Identifier' &&
        coreNamespaces.has(callee.object.name) &&
        callee.property.type === 'Identifier' &&
        callee.property.name === 'craftLiteral'
      );
    };

    // `craftLiteral('open')`, or a binding whose value is one.
    const isTechnical = (node, depth = 0) => {
      if (!node || depth > 8) return false;
      if (
        node.type === 'TSAsExpression' ||
        node.type === 'TSSatisfiesExpression' ||
        node.type === 'TSNonNullExpression'
      )
        return isTechnical(node.expression, depth + 1);
      if (isCraftLiteralCall(node)) return true;
      if (node.type !== 'Identifier') return false;
      const def = findDefinition(node);
      if (
        !def ||
        def.type !== 'Variable' ||
        def.node.id.type !== 'Identifier' ||
        !def.node.init
      )
        return false;
      return isTechnical(def.node.init, depth + 1);
    };

    const isCraftComputedCall = (node) =>
      node.type === 'CallExpression' &&
      node.callee.type === 'Identifier' &&
      node.callee.name === 'craftComputed';

    const computationOf = (node) =>
      node.arguments.find(
        (argument) =>
          argument.type === 'ArrowFunctionExpression' ||
          argument.type === 'FunctionExpression',
      );

    const resolve = (node) => {
      if (node.type === 'CallExpression') {
        if (isCraftComputedCall(node)) return computationOf(node);
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

    // A computed's result is where technical values live: accept marked ones.
    const computedWalk = {
      report: reportLiteral,
      resolve,
      resolveComputed: (node) =>
        isCraftComputedCall(node) ? computationOf(node) : undefined,
      isTechnical,
    };
    // A visible position also reports technical values that become text.
    const visibleWalk = {
      ...computedWalk,
      reportTechnical: (node) => reportLiteral(node, 'technical'),
    };

    return {
      Program(program) {
        // Read imports up front: every visitor below may need them.
        for (const statement of program.body) {
          if (
            statement.type !== 'ImportDeclaration' ||
            statement.source.value !== '@craft-ts/core' ||
            statement.importKind === 'type'
          )
            continue;
          for (const specifier of statement.specifiers) {
            if (specifier.type === 'ImportNamespaceSpecifier') {
              coreNamespaces.add(specifier.local.name);
            } else if (
              specifier.type === 'ImportSpecifier' &&
              specifier.importKind !== 'type' &&
              (specifier.imported.name ?? specifier.imported.value) ===
                'craftLiteral'
            ) {
              craftLiteralNames.add(specifier.local.name);
            }
          }
        }
      },
      ImportDeclaration(node) {
        if (node.source.value !== '@craft-ts/style') return;
        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportNamespaceSpecifier') {
            styleNamespaces.add(specifier.local.name);
          } else if (
            specifier.type === 'ImportSpecifier' &&
            (specifier.imported.name ?? specifier.imported.value) === 'axisPoint'
          ) {
            axisPointNames.add(specifier.local.name);
          }
        }
      },
      CallExpression(node) {
        if (isCraftComputedCall(node)) {
          // Without type information a returned literal may be copy or a
          // token; a technical token is declared with craftLiteral(...).
          const compute = computationOf(node);
          if (compute) reportCopyLiterals(compute, computedWalk);
        }
        const call = parseHyperscriptCall(node);
        if (!call || !call.tag || !TEXT_HELPERS.has(call.tag)) return;

        for (const attribute of TEXT_ATTRIBUTES) {
          const entry = property(call.props, attribute);
          if (!entry) continue;
          reportCopyLiterals(entry.value, {
            ...visibleWalk,
            // Attribute values are not followed into local bindings for copy.
            resolve: () => undefined,
            report: (node) => reportLiteral(node, 'attribute', { attribute }),
            reportTechnical: (node) =>
              reportLiteral(node, 'technicalAttribute', { attribute }),
          });
        }

        // A function, identifier, member expression or translation call is a
        // value supplied by the application. It is intentionally accepted.
        reportCopyLiterals(call.children, visibleWalk);
      },
      Property(node) {
        if (
          node.computed ||
          isInsideAxisPoint(node, axisPointNames, styleNamespaces) ||
          isInsideTranslationCall(node) ||
          isInsidePaletteDefinition(node) ||
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
        // A `kind` field may carry a technical discriminant; the other display
        // fields are text, so a craftLiteral value there is reported.
        const key =
          node.key.type === 'Identifier' ? node.key.name : String(node.key.value);
        reportCopyLiterals(
          node.value,
          key === 'kind' ? computedWalk : visibleWalk,
        );
      },
    };
  },
};
