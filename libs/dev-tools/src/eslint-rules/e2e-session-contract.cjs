const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*$/;

module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'Require stable craft-session annotations on Playwright tests.' },
    schema: [{ type: 'object', properties: { fixtureModules: { type: 'array', items: { type: 'string' } }, allowManualContexts: { type: 'boolean' } }, additionalProperties: false }],
    messages: {
      fixture: 'Importez `test` depuis la fixture craft-session, sinon la session n’est pas rattachée au test.',
      annotation: 'Ajoutez `annotation: craftSession({ id: \'<slug>\' })` aux détails du test.',
      options: 'craftSession doit recevoir un objet littéral avec un id chaîne littérale valide (80 caractères maximum).',
      keep: 'keep doit être un entier de 1 à 10 ; au-delà de 1, ajoutez une reason non vide.',
      duplicate: 'L’id craftSession "{{id}}" est déclaré plusieurs fois dans ce fichier.',
      context: 'Utilisez craftSessions.newContext() afin de rattacher ce contexte au test.',
    },
  },
  create(context) {
    const options = context.options[0] || {};
    const fixtureModules = new Set(options.fixtureModules || ['./fixtures', '../fixtures']);
    const testNames = new Set(['test']);
    const craftNames = new Set(['craftSession']);
    const ids = new Set();
    const reports = new Set();
    const report = (node, messageId, data) => {
      const key = `${node.range?.[0]}:${messageId}`;
      if (reports.has(key)) return;
      reports.add(key);
      context.report({ node, messageId, ...(data ? { data } : {}) });
    };
    const memberName = (node) => node?.type === 'MemberExpression' && !node.computed ? node.property.name : node?.type === 'Identifier' ? node.name : undefined;
    const rootName = (node) => node?.type === 'MemberExpression' ? rootName(node.object) : node?.type === 'Identifier' ? node.name : undefined;
    const callName = (node) => node?.type === 'CallExpression' ? memberName(node.callee) : undefined;
    const isCraftCall = (node) => node?.type === 'CallExpression' && craftNames.has(rootName(node.callee));
    const annotationValue = (details) => {
      if (details?.type !== 'ObjectExpression') return undefined;
      const property = details.properties.find((item) => item.type === 'Property' && memberName(item.key) === 'annotation');
      const value = property?.value;
      return value?.type === 'ArrayExpression' ? value.elements.find(isCraftCall) : isCraftCall(value) ? value : undefined;
    };
    return {
      ImportDeclaration(node) {
        const source = node.source.value;
        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportSpecifier' && specifier.imported.name === 'test') {
            testNames.add(specifier.local.name);
            if (!fixtureModules.has(source)) report(specifier, 'fixture');
          }
          if (specifier.type === 'ImportSpecifier' && specifier.imported.name === 'craftSession') craftNames.add(specifier.local.name);
          if (fixtureModules.has(source) && specifier.type === 'ImportSpecifier' && specifier.imported.name === 'test') testNames.add(specifier.local.name);
        }
      },
      CallExpression(node) {
        if (!options.allowManualContexts && ['newContext', 'newPage'].includes(callName(node)) && rootName(node.callee) === 'browser') report(node, 'context');
        if (isCraftCall(node)) {
          const argument = node.arguments[0];
          if (argument?.type !== 'ObjectExpression') { report(node, 'options'); return; }
          const idProperty = argument.properties.find((item) => item.type === 'Property' && memberName(item.key) === 'id');
          const id = idProperty?.value;
          const loopIdentifier = id?.type === 'Identifier' && id.parent?.type === 'Property' && id.parent.parent?.type === 'ObjectExpression' && id.parent.parent.parent?.type === 'CallExpression' && id.parent.parent.parent.parent?.type === 'Property' && id.parent.parent.parent.parent.parent?.type === 'ObjectExpression' && isLoopVariable(id);
          if (loopIdentifier) return;
          if (id?.type !== 'Literal' || typeof id.value !== 'string' || id.value.length > 80 || !ID.test(id.value)) report(idProperty || node, 'options');
          else if (ids.has(id.value)) report(idProperty, 'duplicate', { id: id.value });
          else ids.add(id.value);
          const keepProperty = argument.properties.find((item) => item.type === 'Property' && memberName(item.key) === 'keep');
          const keep = keepProperty?.value?.value ?? 1;
          const reasonProperty = argument.properties.find((item) => item.type === 'Property' && memberName(item.key) === 'reason');
          const reason = reasonProperty?.value?.value;
          if (typeof keep !== 'number' || !Number.isInteger(keep) || keep < 1 || keep > 10 || (keep > 1 && (typeof reason !== 'string' || !reason.trim()))) report(keepProperty || node, 'keep');
        }
        if (!testNames.has(rootName(node.callee)) || !['test', 'only', 'skip', 'fixme'].includes(callName(node))) return;
        if (node.arguments.length < 3 || !annotationValue(node.arguments[1])) report(node, 'annotation');
      },
    };
  },
};

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
