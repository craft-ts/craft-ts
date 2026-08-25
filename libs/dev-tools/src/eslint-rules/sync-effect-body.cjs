// ---------------------------------------------------------------------------
// `SyncOp` in `R` is a CLAIM: an author writing `Effect<A, E, SyncOp>` promises
// the Effect never suspends. The type system cannot check that claim — a
// service member closes its dependencies at Layer construction, so an async
// member and a pure one both surface as `R = never` and stay indistinguishable.
//
// This rule reads the body instead, all branches at once, which is the thing a
// unit test cannot do: it needs no fixture, and a branch that only suspends on
// a cold cache is as visible as one that always does.
//
// It works by ELIMINATION. Requirements union through `Effect.gen`, so anything
// yielded that is itself declared synchronous carries `SyncOp` and passes for
// free. What is left ambiguous is `R = never`: either a pure constructor
// (`Effect.succeed`) or an async member whose Layer swallowed its dependencies.
// The first list is short and closed, so it is the one spelled out here; the
// rest is refused, and the author either declares it or moves it to a loader.
// ---------------------------------------------------------------------------

const EFFECT_PACKAGE = 'effect';
const CRAFT_EFFECT_PACKAGE = '@craft-ts/effect';

/** Constructors that cannot suspend — the closed list `R = never` needs. */
const PURE_EFFECT_CONSTRUCTORS = new Set([
  'succeed',
  'sync',
  'fail',
  'failSync',
  'die',
  'dieSync',
  'void',
  'try',
  'succeedNone',
  'succeedSome',
  'fromNullable',
]);

/** Constructors that always suspend — named so the message can be specific. */
const ASYNC_EFFECT_CONSTRUCTORS = new Set([
  'promise',
  'tryPromise',
  'sleep',
  'async',
  'callback',
  'never',
  'delay',
  'timeout',
]);

const SYNC_OP_PATTERN = /\bSyncOp\b/;

/** `ts.SymbolFlags.Class`. */
const SYMBOL_FLAG_CLASS = 32;

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Keep a body declared synchronous (SyncOp) free of anything that may suspend.',
    },
    schema: [],
    messages: {
      asyncConstructor:
        'Effect.{{name}}(...) always suspends: it cannot appear in a body declared synchronous (SyncOp).\nMove the asynchronous work to a loader (queryEffect / mutationEffect / asyncProcessEffect).',
      notDeclaredSync:
        'This body is declared synchronous (SyncOp) but yields {{what}}, which nothing declares synchronous.\nAdd SyncOp to its requirements if it is pure, or move the work to a loader (queryEffect / mutationEffect / asyncProcessEffect).',
    },
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const parserServices = sourceCode.parserServices ?? context.parserServices;
    const checker = parserServices?.program?.getTypeChecker?.();
    const nodeMap = parserServices?.esTreeNodeToTSNodeMap;
    const keys = sourceCode.visitorKeys ?? {};

    const effectBindings = new Set();
    const syncOpBindings = new Set();

    return {
      ImportDeclaration(node) {
        if (node.importKind === 'type') return;
        const source = node.source.value;

        for (const specifier of node.specifiers) {
          if (
            specifier.type === 'ImportNamespaceSpecifier' &&
            source === EFFECT_PACKAGE
          ) {
            effectBindings.add(specifier.local.name);
            continue;
          }

          if (specifier.type !== 'ImportSpecifier') continue;
          const imported = getIdentifierName(specifier.imported);

          if (source === EFFECT_PACKAGE && imported === 'Effect') {
            effectBindings.add(specifier.local.name);
          }
          if (source === CRAFT_EFFECT_PACKAGE && imported === 'SyncOp') {
            syncOpBindings.add(specifier.local.name);
          }
        }
      },

      CallExpression(node) {
        if (!isEffectMemberCall(node.callee, 'gen')) return;

        const body = node.arguments.find((argument) =>
          ['FunctionExpression', 'ArrowFunctionExpression'].includes(
            argument?.type,
          ),
        );
        if (!body) return;

        const delegatedYields = collectDelegatedYields(body);
        if (!isDeclaredSynchronous(node, delegatedYields)) return;

        for (const yielded of delegatedYields) {
          inspectYield(yielded);
        }
      },
    };

    // A body is declared synchronous either by yielding the marker itself — the
    // spelling for an inferred `R` — or by the shape it is contextually typed
    // against already spelling `SyncOp`, in which case the implementation needs
    // no ceremony at all.
    function isDeclaredSynchronous(genCall, delegatedYields) {
      if (delegatedYields.some(isSyncOpReference)) return true;
      return contextualTypeDeclaresSync(genCall);
    }

    function contextualTypeDeclaresSync(genCall) {
      if (!checker || !nodeMap) return false;

      // Walk out to the function whose return type the shape constrains.
      let current = genCall.parent;
      while (
        current &&
        !['ArrowFunctionExpression', 'FunctionExpression'].includes(
          current.type,
        )
      ) {
        if (current.type === 'CallExpression') return false;
        current = current.parent;
      }
      if (!current) return false;

      const tsNode = nodeMap.get(current);
      if (!tsNode) return false;

      const contextual = checker.getContextualType?.(tsNode);
      return Boolean(contextual && SYNC_OP_PATTERN.test(safeToString(contextual)));
    }

    function inspectYield(yielded) {
      if (isSyncOpReference(yielded)) return;

      const asyncConstructor = getEffectConstructorName(
        yielded,
        ASYNC_EFFECT_CONSTRUCTORS,
      );
      if (asyncConstructor) {
        context.report({
          node: yielded,
          messageId: 'asyncConstructor',
          data: { name: asyncConstructor },
        });
        return;
      }

      if (getEffectConstructorName(yielded, PURE_EFFECT_CONSTRUCTORS)) return;
      // `yield* SomeService` resolves a tag from the context in place; it is the
      // Layer that already ran, not a suspension.
      if (isServiceTagReference(yielded)) return;
      if (typeDeclaresSync(yielded)) return;
      // Without type information the rule cannot tell a pure member from an
      // async one, and guessing either way is worse than staying silent.
      if (!checker || !nodeMap) return;
      // Not an Effect at all (a craft primitive relayed through the body).
      if (!isEffectType(yielded)) return;

      context.report({
        node: yielded,
        messageId: 'notDeclaredSync',
        data: { what: describe(yielded) },
      });
    }

    function isSyncOpReference(node) {
      return node?.type === 'Identifier' && syncOpBindings.has(node.name);
    }

    function isEffectMemberCall(callee, memberName) {
      return (
        callee?.type === 'MemberExpression' &&
        !callee.computed &&
        callee.object.type === 'Identifier' &&
        effectBindings.has(callee.object.name) &&
        getIdentifierName(callee.property) === memberName
      );
    }

    function getEffectConstructorName(node, names) {
      const call = node?.type === 'CallExpression' ? node : undefined;
      const callee = call ? call.callee : node;

      if (
        callee?.type !== 'MemberExpression' ||
        callee.computed ||
        callee.object.type !== 'Identifier' ||
        !effectBindings.has(callee.object.name)
      ) {
        return undefined;
      }

      const name = getIdentifierName(callee.property);
      return name && names.has(name) ? name : undefined;
    }

    // A bare identifier that resolves to a CLASS is a `Context.Service` tag:
    // `yield* Pricing` reads it from the context in place — the Layer already
    // ran. A bare identifier merely holding an Effect is not a class, and falls
    // through to the type check below.
    function isServiceTagReference(node) {
      if (node?.type !== 'Identifier' || !checker || !nodeMap) return false;

      const tsNode = nodeMap.get(node);
      if (!tsNode) return false;

      const symbol = checker.getSymbolAtLocation(tsNode);
      // ts.SyntaxFlags.Class — compared numerically to keep the rule free of a
      // typescript import, like the other typed rules in this folder.
      return Boolean(symbol && (symbol.flags & SYMBOL_FLAG_CLASS) !== 0);
    }

    function typeDeclaresSync(node) {
      if (!checker || !nodeMap) return false;
      const type = getType(node);
      return Boolean(type && SYNC_OP_PATTERN.test(safeToString(type)));
    }

    function isEffectType(node) {
      const type = getType(node);
      if (!type) return false;
      const text = safeToString(type);
      if (/\bEffect(?:\.Effect)?\s*</.test(text)) return true;
      const symbol = type.aliasSymbol ?? type.getSymbol?.();
      const name = symbol && String(symbol.escapedName ?? symbol.name);
      return name === 'Effect';
    }

    function getType(node) {
      if (!checker || !nodeMap || !node) return undefined;
      const tsNode = nodeMap.get(node);
      if (!tsNode) return undefined;
      try {
        return checker.getTypeAtLocation(tsNode);
      } catch {
        return undefined;
      }
    }

    function safeToString(type) {
      try {
        return checker.typeToString(type);
      } catch {
        return '';
      }
    }

    function describe(node) {
      const text = sourceCode.getText(node);
      return text.length > 60 ? `${text.slice(0, 57)}…` : text;
    }

    function collectDelegatedYields(functionNode) {
      const found = [];
      walk(
        functionNode,
        (child) => {
          // A nested `Effect.gen` carries its own declaration and gets its own
          // visit — descending into it here would blame the wrong body.
          if (child !== functionNode && isEffectGenCall(child)) {
            return 'skip';
          }

          if (child.type === 'YieldExpression' && child.delegate) {
            const argument = unwrap(child.argument);
            if (argument) found.push(argument);
          }

          return undefined;
        },
        keys,
      );
      return found;
    }

    function isEffectGenCall(node) {
      return node.type === 'CallExpression' && isEffectMemberCall(node.callee, 'gen');
    }
  },
};

function getIdentifierName(node) {
  if (!node) return undefined;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'Literal' && typeof node.value === 'string') {
    return node.value;
  }
  return undefined;
}

function unwrap(node) {
  let current = node;
  while (
    current &&
    (current.type === 'TSAsExpression' ||
      current.type === 'TSNonNullExpression' ||
      current.type === 'TSSatisfiesExpression')
  ) {
    current = current.expression;
  }
  return current;
}

function walk(node, visit, keys) {
  if (!node || typeof node.type !== 'string') return;
  if (visit(node) === 'skip') return;

  const childKeys = keys[node.type] ?? Object.keys(node);
  for (const key of childKeys) {
    if (key === 'parent') continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) walk(child, visit, keys);
    } else if (value && typeof value.type === 'string') {
      walk(value, visit, keys);
    }
  }
}
