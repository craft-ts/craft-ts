const ANGULAR_CORE = '@angular/core';
const ANGULAR_HTTP = '@angular/common/http';
const ANGULAR_RXJS_INTEROP = '@angular/core/rxjs-interop';
const RXJS = 'rxjs';
const { isInsideCraftPrimitive } = require('./craft-primitive-context.cjs');

const ANGULAR_APIS = new Map([
  [
    'signal',
    {
      kind: 'signal',
      replacement: 'state()',
      message: signalMessage('signal'),
    },
  ],
  [
    'computed',
    {
      kind: 'computed',
      replacement: 'craftComputed()',
      message:
        'Angular computed() is forbidden in authored Craft code. Use craftComputed() from @craft-ng/core for observability and host tracking.',
    },
  ],
  [
    'effect',
    {
      kind: 'effect',
      replacement: 'craftEffect()',
      message:
        "Angular effect() is forbidden in authored Craft code. Use craftEffect('name', ...) from @craft-ng/core for observability and host tracking.",
    },
  ],
  [
    'resource',
    {
      kind: 'resource',
      replacement: 'query()',
      message:
        'Angular resource() is forbidden in authored Craft code. Use query() for server state, or mutation()/asyncProcess() for command-like work.',
    },
  ],
  [
    'httpResource',
    {
      kind: 'resource',
      replacement: 'query()',
      message:
        'Angular httpResource() is forbidden in authored Craft code. Use query() with CraftHttpClient instead.',
    },
  ],
  [
    'rxResource',
    {
      kind: 'resource',
      replacement: 'query()',
      message:
        'Angular rxResource() is forbidden in authored Craft code. Use query() with a source$ dependency instead.',
    },
  ],
]);

const SUBJECTS = new Set(['Subject', 'BehaviorSubject', 'ReplaySubject']);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Prefer Craft state, queries, effects, sources, and on$ over Angular signal APIs, resources, explicit subscriptions, and RxJS subjects.',
    },
    schema: [],
    messages: {
      subscribe:
        'Explicit .subscribe() is forbidden in authored Craft code. Prefer a declarative query/mutation/asyncProcess flow or source$ with on$ so dependencies and cleanup remain observable.',
      subject:
        'RxJS {{name}} is forbidden in authored Craft code. Use a named source$ (and on$ for reactions) so the dependency can be observed and type-checked by Craft.',
      signal: signalMessage('signal'),
      signalType:
        'Angular Signal types are forbidden in authored Craft code. Use the state() primitive and its inferred output types instead.',
      computed:
        'Angular computed() is forbidden in authored Craft code. Use craftComputed() from @craft-ng/core for observability and host tracking.',
      effect:
        "Angular effect() is forbidden in authored Craft code. Use craftEffect('name', ...) from @craft-ng/core for observability and host tracking.",
      resource:
        'Angular resource APIs are forbidden in authored Craft code. Use query() (or mutation()/asyncProcess() when appropriate) from @craft-ng/core.',
    },
  },

  create(context) {
    const localApis = new Map();
    const namespaceImports = new Map();

    return {
      ImportDeclaration(node) {
        const source = node.source.value;
        if (typeof source !== 'string') {
          return;
        }

        const sourceApis = getApisForSource(source);
        const isRxjs = source === RXJS || source.startsWith(`${RXJS}/`);

        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportNamespaceSpecifier') {
            if (sourceApis.size > 0 || isRxjs) {
              namespaceImports.set(specifier.local.name, {
                sourceApis,
                isRxjs,
              });
            }
            continue;
          }

          if (
            specifier.type !== 'ImportSpecifier' ||
            specifier.imported.type !== 'Identifier'
          ) {
            continue;
          }

          const importedName = specifier.imported.name;
          const api = sourceApis.get(importedName);
          if (api) {
            localApis.set(specifier.local.name, api);
            if (api.kind !== 'computed') {
              reportApi(context, specifier, api);
            }
            continue;
          }

          if (isRxjs && SUBJECTS.has(importedName)) {
            localApis.set(specifier.local.name, {
              kind: 'subject',
              name: importedName,
            });
            context.report({
              node: specifier,
              messageId: 'subject',
              data: { name: importedName },
            });
          }
        }
      },

      CallExpression(node) {
        reportDirectUsage(node);
        reportNamespaceUsage(node);
      },

      NewExpression(node) {
        reportDirectUsage(node);
        reportNamespaceUsage(node);
      },

      MemberExpression(node) {
        if (getPropertyName(node) === 'subscribe') {
          context.report({ node: node.property, messageId: 'subscribe' });
        }
      },
    };

    function reportDirectUsage(node) {
      if (node.callee.type !== 'Identifier') {
        return;
      }

      const api = localApis.get(node.callee.name);
      if (!api) {
        return;
      }

      if (api.kind === 'subject') {
        context.report({
          node: node.callee,
          messageId: 'subject',
          data: { name: api.name },
        });
        return;
      }

      if (api.kind === 'computed' && isInsideCraftPrimitive(node)) {
        return;
      }

      reportApi(context, node.callee, api);
    }

    function reportNamespaceUsage(node) {
      if (
        node.callee.type !== 'MemberExpression' ||
        node.callee.computed ||
        node.callee.object.type !== 'Identifier' ||
        node.callee.property.type !== 'Identifier'
      ) {
        return;
      }

      const namespace = namespaceImports.get(node.callee.object.name);
      if (!namespace) {
        return;
      }

      const name = node.callee.property.name;
      const api = namespace.sourceApis.get(name);
      if (api) {
        if (api.kind !== 'computed' || !isInsideCraftPrimitive(node)) {
          reportApi(context, node.callee.property, api);
        }
      } else if (namespace.isRxjs && SUBJECTS.has(name)) {
        context.report({
          node: node.callee.property,
          messageId: 'subject',
          data: { name },
        });
      }
    }
  },
};

function getApisForSource(source) {
  const apis = new Map();

  if (source === ANGULAR_CORE) {
    for (const [names, api] of ANGULAR_APIS) {
      for (const name of Array.isArray(names) ? names : [names]) {
        apis.set(name, api);
      }
    }
  } else if (source === ANGULAR_HTTP) {
    apis.set('httpResource', ANGULAR_APIS.get('httpResource'));
  } else if (source === ANGULAR_RXJS_INTEROP) {
    apis.set('rxResource', ANGULAR_APIS.get('rxResource'));
  }

  return apis;
}

function reportApi(context, node, api) {
  context.report({
    node,
    messageId: api.kind,
  });
}

function getPropertyName(node) {
  if (!node.computed && node.property.type === 'Identifier') {
    return node.property.name;
  }

  if (node.computed && node.property.type === 'Literal') {
    return typeof node.property.value === 'string'
      ? node.property.value
      : undefined;
  }

  return undefined;
}

function signalMessage(name) {
  return `Angular ${name}() is forbidden in authored Craft code. Use state() from @craft-ng/core for observable, named state and type-safe dependencies.`;
}
