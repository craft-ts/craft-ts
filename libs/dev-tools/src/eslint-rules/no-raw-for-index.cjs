/** Local, scope-aware analysis. Immutable aliases are followed; values stored in
 * objects, returned from helpers or imported callbacks need type checking/review. */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Require a reactive forNode index to be read before scalar coercion.',
    },
    schema: [],
    messages: {
      raw: 'The forNode index is a reactive reader, not a scalar (index() returns a generator). Read it with yield* index() inside the generator binding or action that needs its current value.',
    },
  },
  create(context) {
    const source = context.sourceCode ?? context.getSourceCode();
    const calls = [];
    const readers = new Set();
    const reported = new Set();
    function variable(node) {
      let scope = source.getScope(node);
      while (scope) {
        const found = scope.set.get(node.name);
        if (found) return found;
        scope = scope.upper;
      }
    }
    function unwrap(node) {
      while (
        node &&
        [
          'TSAsExpression',
          'TSTypeAssertion',
          'TSNonNullExpression',
          'ChainExpression',
          'TSSatisfiesExpression',
        ].includes(node.type)
      )
        node = node.expression;
      return node;
    }
    // Follow only immutable bindings with one definition. In particular an
    // assignment to a mutable alias must not taint an unrelated local function.
    function definition(node) {
      const binding = variable(node);
      if (binding?.defs.length !== 1) return;
      const def = binding.defs[0];
      if (def.type === 'FunctionName') return def.node;
      if (
        def.type === 'Variable' &&
        def.parent.kind === 'const' &&
        !binding.references.some((ref) => ref.isWrite() && !ref.init)
      )
        return def.node.init;
    }
    function resolve(node, seen = new Set()) {
      node = unwrap(node);
      if (node?.type !== 'Identifier') return node;
      const binding = variable(node);
      if (!binding || seen.has(binding)) return node;
      seen.add(binding);
      const value = definition(node);
      return value ? resolve(value, seen) : node;
    }
    function imported(node, name) {
      node = resolve(node);
      if (node?.type === 'Identifier') {
        const def = variable(node)?.defs[0];
        return (
          def?.type === 'ImportBinding' &&
          def.node.type === 'ImportSpecifier' &&
          (def.node.imported.name ?? def.node.imported.value) === name &&
          craftModule(def.parent.source.value)
        );
      }
      if (
        node?.type === 'MemberExpression' &&
        !node.computed &&
        node.property.name === name
      ) {
        const object = resolve(node.object);
        const def = object?.type === 'Identifier' && variable(object)?.defs[0];
        return (
          def?.type === 'ImportBinding' &&
          def.node.type === 'ImportNamespaceSpecifier' &&
          craftModule(def.parent.source.value)
        );
      }
      return false;
    }
    function craftModule(name) {
      // A same-named export in a relative module is not proof of Craft identity.
      return name === '@craft-ts/component';
    }
    function kind(node, seen = new Set()) {
      node = unwrap(node);
      if (!node) return;
      if (node.type === 'Identifier') {
        const binding = variable(node);
        if (readers.has(binding)) return 'reader';
        if (!binding || seen.has(binding)) return;
        seen.add(binding);
        return kind(definition(node), seen);
      }
      if (
        node.type === 'CallExpression' &&
        node.arguments.length === 0 &&
        kind(node.callee, seen) === 'reader'
      )
        return 'generator';
      // Coercing a conditional result also coerces either selected reader.
      if (node.type === 'ConditionalExpression')
        return (
          kind(node.consequent, new Set(seen)) ?? kind(node.alternate, seen)
        );
      if (node.type === 'LogicalExpression')
        return kind(node.left, new Set(seen)) ?? kind(node.right, seen);
      if (node.type === 'SequenceExpression')
        return kind(node.expressions.at(-1), seen);
    }
    function report(node) {
      if (!node || !kind(node) || reported.has(node)) return;
      reported.add(node);
      context.report({ node, messageId: 'raw' });
    }
    function globalCoercion(node) {
      node = resolve(node);
      return (
        node.type === 'Identifier' &&
        ['String', 'Boolean', 'Number', 'BigInt'].includes(node.name) &&
        !variable(node)?.defs.length
      );
    }
    function walk(node) {
      if (!node) return;
      switch (node.type) {
        case 'TemplateLiteral':
          node.expressions.forEach(report);
          break;
        case 'CallExpression':
        case 'NewExpression':
          if (globalCoercion(node.callee)) report(node.arguments[0]);
          if (
            node.callee.type === 'MemberExpression' &&
            !node.callee.computed &&
            ['toString', 'toLocaleString', 'valueOf'].includes(
              node.callee.property.name,
            )
          )
            report(node.callee.object);
          break;
        case 'UnaryExpression':
          if (['!', '+', '-', '~'].includes(node.operator))
            report(node.argument);
          break;
        case 'BinaryExpression':
          // Reference identity and instanceof inspect the reader as a reader.
          if (!['===', '!==', 'instanceof', 'in'].includes(node.operator)) {
            report(node.left);
            report(node.right);
          }
          break;
        case 'LogicalExpression':
          if (node.operator !== '??') report(node.left);
          break;
        case 'IfStatement':
        case 'WhileStatement':
        case 'DoWhileStatement':
        case 'ForStatement':
        case 'ConditionalExpression':
          report(node.test);
          break;
        case 'SwitchStatement':
          report(node.discriminant);
          break;
      }
      for (const key of source.visitorKeys[node.type] ?? []) {
        const child = node[key];
        if (Array.isArray(child)) child.forEach(walk);
        else walk(child);
      }
    }
    return {
      CallExpression(node) {
        calls.push(node);
      },
      'Program:exit'(program) {
        for (const call of calls) {
          if (!imported(call.callee, 'forNode')) continue;
          const callback = resolve(call.arguments[2]);
          if (
            ![
              'ArrowFunctionExpression',
              'FunctionExpression',
              'FunctionDeclaration',
            ].includes(callback?.type)
          )
            continue;
          const index = callback.params[1];
          if (index?.type === 'Identifier') readers.add(variable(index));
        }
        walk(program);
      },
    };
  },
};
