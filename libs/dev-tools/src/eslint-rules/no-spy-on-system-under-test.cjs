/**
 * A behaviour test checks what the system under test exposes, or what it
 * sends to its boundaries; it never spies on the system itself.
 *
 * `expect(sut.save).toHaveBeenCalled()` proves that one function calls
 * another, which is how the service is cut today, not what it does: merge two
 * methods and the test fails although nothing a user sees has changed.
 *
 * `sut` is whatever a craft test helper returns under that name:
 * `const { sut } = setupCraftServiceTest(…)`, `const t = await
 * setupCraftServiceTestingByRegister(…)` then `t.sut`.
 */
const SETUP_HELPERS = new Set([
  'setupCraftServiceTest',
  'setupCraftServiceTestingByRegister',
  'setupTestingService',
]);
const CALL_MATCHERS = /^(?:toHaveBeenCalled\w*|toBeCalled\w*|toHaveBeenLastCalledWith|toHaveBeenNthCalledWith|lastCalledWith|nthCalledWith)$/;

module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'Forbid spying on the system under test returned by the craft test helpers.' },
    schema: [],
    messages: {
      spy: 'N’espionnez pas le système testé ({{name}}) : vérifiez ce qu’il expose, ou ce qu’il envoie à une frontière mockée (HTTP, server function, API du navigateur).',
    },
  },
  create(context) {
    // Names bound to the sut itself, and to the whole helper result.
    const suts = new Set();
    const results = new Set();

    const unwrap = (node) => (node?.type === 'AwaitExpression' ? node.argument : node);
    const helperName = (node) => {
      const call = unwrap(node);
      if (call?.type !== 'CallExpression') return undefined;
      const callee = call.callee;
      if (callee.type === 'Identifier') return callee.name;
      if (callee.type === 'MemberExpression' && !callee.computed && callee.object.type === 'Identifier') return callee.object.name;
      return undefined;
    };
    /** `sut`, `t.sut`, `sut.save`, `t.sut.cart.add` — the name if it reaches the sut. */
    const reachesSut = (node) => {
      let current = node;
      const path = [];
      while (current?.type === 'MemberExpression' && !current.computed) {
        path.unshift(current.property.name);
        current = current.object;
      }
      if (current?.type !== 'Identifier') return undefined;
      if (suts.has(current.name)) return [current.name, ...path].join('.');
      if (results.has(current.name) && path[0] === 'sut') return [current.name, ...path].join('.');
      return undefined;
    };

    return {
      VariableDeclarator(node) {
        if (!SETUP_HELPERS.has(helperName(node.init))) return;
        if (node.id.type === 'Identifier') results.add(node.id.name);
        if (node.id.type === 'ObjectPattern') {
          for (const property of node.id.properties) {
            if (property.type === 'Property' && !property.computed && property.key.type === 'Identifier' && property.key.name === 'sut' && property.value.type === 'Identifier') {
              suts.add(property.value.name);
            }
          }
        }
      },
      CallExpression(node) {
        const callee = node.callee;
        // vi.spyOn(sut, 'save') / jest.spyOn(sut.cart, 'add')
        if (callee.type === 'MemberExpression' && !callee.computed && callee.property.name === 'spyOn') {
          const name = reachesSut(node.arguments[0]);
          if (name) context.report({ node, messageId: 'spy', data: { name } });
          return;
        }
        // expect(sut.save).toHaveBeenCalled() / expect(sut.save).not.toHaveBeenCalled()
        if (callee.type !== 'MemberExpression' || callee.computed || !CALL_MATCHERS.test(callee.property.name)) return;
        let subject = callee.object;
        if (subject.type === 'MemberExpression' && !subject.computed && ['not', 'resolves', 'rejects'].includes(subject.property.name)) subject = subject.object;
        if (subject.type !== 'CallExpression' || subject.callee.type !== 'Identifier' || subject.callee.name !== 'expect') return;
        const name = reachesSut(subject.arguments[0]);
        if (name) context.report({ node, messageId: 'spy', data: { name } });
      },
    };
  },
};
