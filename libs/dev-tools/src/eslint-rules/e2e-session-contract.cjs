const path = require('node:path');

const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*$/;
// `test.<modifier>(title, …, fn)` declares a test; the same modifiers without a
// body (`test.skip()`, `test.skip(condition, 'reason')`) only annotate the
// running one.
const TEST_MODIFIERS = new Set(['only', 'skip', 'fixme', 'fail']);
const FIXTURE_EXTENSIONS = ['', '.ts', '.mts', '.cts', '.js', '.mjs', '.cjs', '/index.ts', '/index.js'];

module.exports = {
  meta: {
    type: 'problem',
    hasSuggestions: true,
    docs: { description: 'Require stable craft-session annotations on Playwright tests.' },
    schema: [{
      type: 'object',
      properties: {
        fixtureModules: { type: 'array', items: { type: 'string' } },
        fixtureFiles: { type: 'array', items: { type: 'string' } },
        allowManualContexts: { type: 'boolean' },
      },
      additionalProperties: false,
    }],
    messages: {
      fixture: 'Importez `test` depuis la fixture craft-session, sinon la session n’est pas rattachée au test.',
      annotation: 'Ajoutez `annotation: craftSession({ id: \'<slug>\' })` aux détails du test.',
      suggestAnnotation: 'Ajouter `annotation: craftSession({ id: \'{{id}}\' })`.',
      describe: 'L’annotation craftSession se pose sur chaque test, pas sur le groupe : un id hérité par plusieurs tests serait dupliqué.',
      options: 'craftSession doit recevoir un objet littéral avec un id chaîne littérale valide (80 caractères maximum).',
      keep: 'keep doit être un entier de 1 à 10 ; au-delà de 1, ajoutez une reason non vide.',
      keepLiteral: 'keep doit être un entier littéral : le contrat se lit sans exécuter le fichier.',
      reasonLiteral: 'reason doit être une chaîne littérale : le contrat se lit sans exécuter le fichier.',
      duplicate: 'L’id craftSession "{{id}}" est déclaré plusieurs fois dans ce fichier.',
      context: 'Utilisez craftSessions.newContext() afin de rattacher ce contexte au test.',
    },
  },
  create(context) {
    const options = context.options[0] || {};
    const fixtureModules = new Set(options.fixtureModules || (options.fixtureFiles ? [] : ['./fixtures', '../fixtures']));
    const cwd = context.cwd ?? (typeof context.getCwd === 'function' ? context.getCwd() : process.cwd());
    const fixtureFiles = new Set((options.fixtureFiles || []).map((file) => path.resolve(cwd, file)));
    const filename = context.filename ?? context.getFilename();
    const isFixture = (source) => {
      if (fixtureModules.has(source)) return true;
      if (!source.startsWith('.') || fixtureFiles.size === 0) return false;
      const resolved = path.resolve(path.dirname(filename), source);
      return FIXTURE_EXTENSIONS.some((extension) => fixtureFiles.has(resolved + extension) || fixtureFiles.has(resolved.replace(/\.[cm]?js$/, '') + extension));
    };
    const testNames = new Set(['test']);
    const craftNames = new Set(['craftSession']);
    const ids = new Set();
    const reports = new Set();
    const report = (node, messageId, data, suggest) => {
      const key = `${node.range?.[0]}:${messageId}`;
      if (reports.has(key)) return;
      reports.add(key);
      context.report({ node, messageId, ...(data ? { data } : {}), ...(suggest ? { suggest } : {}) });
    };
    const memberName = (node) => node?.type === 'MemberExpression' && !node.computed ? node.property.name : node?.type === 'Identifier' ? node.name : undefined;
    const rootName = (node) => node?.type === 'MemberExpression' ? rootName(node.object) : node?.type === 'Identifier' ? node.name : undefined;
    const chain = (node) => node?.type === 'MemberExpression' && !node.computed ? [...chain(node.object), node.property.name] : node?.type === 'Identifier' ? [node.name] : [];
    const callName = (node) => node?.type === 'CallExpression' ? memberName(node.callee) : undefined;
    const isCraftCall = (node) => node?.type === 'CallExpression' && craftNames.has(rootName(node.callee));
    const isFunction = (node) => node?.type === 'ArrowFunctionExpression' || node?.type === 'FunctionExpression';
    const property = (object, name) => object.properties.find((item) => item.type === 'Property' && memberName(item.key) === name);
    const annotationValue = (details) => {
      if (details?.type !== 'ObjectExpression') return undefined;
      const value = property(details, 'annotation')?.value;
      return value?.type === 'ArrayExpression' ? value.elements.find(isCraftCall) : isCraftCall(value) ? value : undefined;
    };
    /** 'test' for a call that declares a test, 'describe' for a group, undefined otherwise. */
    const declaration = (node) => {
      const names = chain(node.callee);
      if (!testNames.has(names[0])) return undefined;
      if (names.includes('describe')) return 'describe';
      if (names.length === 1) return 'test';
      // A title then a body; a lone callback is a condition (`test.skip(({ browserName }) => …)`).
      if (names.length === 2 && TEST_MODIFIERS.has(names[1]) && !isFunction(node.arguments[0]) && node.arguments.slice(1).some(isFunction)) return 'test';
      return undefined;
    };
    const suggestion = (node) => {
      const [title, body] = node.arguments;
      if (node.arguments.length !== 2 || !isFunction(body) || title?.type !== 'Literal' || typeof title.value !== 'string') return undefined;
      const id = slug(title.value);
      if (!id) return undefined;
      return [{ messageId: 'suggestAnnotation', data: { id }, fix: (fixer) => fixer.insertTextAfter(title, `, { annotation: craftSession({ id: '${id}' }) }`) }];
    };
    return {
      ImportDeclaration(node) {
        const source = node.source.value;
        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportSpecifier' && specifier.imported.name === 'test') {
            testNames.add(specifier.local.name);
            if (!isFixture(source)) report(specifier, 'fixture');
          }
          if (specifier.type === 'ImportSpecifier' && specifier.imported.name === 'craftSession') craftNames.add(specifier.local.name);
        }
      },
      CallExpression(node) {
        if (!options.allowManualContexts && ['newContext', 'newPage'].includes(callName(node)) && rootName(node.callee) === 'browser') report(node, 'context');
        if (isCraftCall(node)) checkContract(node);
        const kind = declaration(node);
        if (kind === 'describe') {
          if (node.arguments.some((argument) => annotationValue(argument))) report(node, 'describe');
        } else if (kind === 'test' && (node.arguments.length < 3 || !annotationValue(node.arguments[1]))) {
          report(node, 'annotation', undefined, suggestion(node));
        }
      },
    };

    function checkContract(node) {
      const argument = node.arguments[0];
      if (argument?.type !== 'ObjectExpression') { report(node, 'options'); return; }
      const idProperty = property(argument, 'id');
      const id = idProperty?.value;
      // An id generated in a loop is checked by the architecture test, which sees each one.
      if (!isLoopId(id)) {
        if (id?.type !== 'Literal' || typeof id.value !== 'string' || id.value.length > 80 || !ID.test(id.value)) report(idProperty || node, 'options');
        else if (ids.has(id.value)) report(idProperty, 'duplicate', { id: id.value });
        else ids.add(id.value);
      }
      const keepProperty = property(argument, 'keep');
      const reasonProperty = property(argument, 'reason');
      if (keepProperty && !(keepProperty.value.type === 'Literal' && typeof keepProperty.value.value === 'number')) { report(keepProperty, 'keepLiteral'); return; }
      if (reasonProperty && staticString(reasonProperty.value) === undefined) { report(reasonProperty, 'reasonLiteral'); return; }
      const keep = keepProperty ? keepProperty.value.value : 1;
      const reason = reasonProperty ? staticString(reasonProperty.value) : undefined;
      if (!Number.isInteger(keep) || keep < 1 || keep > 10 || (keep > 1 && !reason?.trim())) report(keepProperty || node, 'keep');
    }
  },
};

/** `id` (a loop variable) or `` `orders.${name}` `` whose expressions are all loop variables. */
function isLoopId(node) {
  if (node?.type === 'Identifier') return isLoopVariable(node);
  return node?.type === 'TemplateLiteral' && node.expressions.length > 0 && node.expressions.every((expression) => expression.type === 'Identifier' && isLoopVariable(expression));
}

function isLoopVariable(identifier) {
  let parent = identifier.parent;
  while (parent) {
    if ((parent.type === 'ForOfStatement' || parent.type === 'ForInStatement') && parent.left.type === 'VariableDeclaration') {
      const declaration = parent.left.declarations[0];
      if (declaration?.id.type === 'Identifier' && declaration.id.name === identifier.name) return true;
    }
    parent = parent.parent;
  }
  return false;
}

function staticString(node) {
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0]?.value.cooked ?? undefined;
  return undefined;
}

function slug(title) {
  return title.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '');
}
