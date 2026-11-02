const MUTATION_METHODS = new Set(['set', 'update']);

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow custom callable state facades that combine reads with synchronous set and update methods.',
      url: 'https://craft-ts.github.io/craft/guide/routing/eslint-rules',
    },
    schema: [],
    messages: {
      facade:
        'Do not define a callable state facade with synchronous mutation methods. Expose the state insertion from state(...) and delegate writes with yield*.',
    },
  },

  create(context) {
    return {
      TSTypeAliasDeclaration(node) {
        if (isCallableStateFacade(node.typeAnnotation)) {
          context.report({ node, messageId: 'facade' });
        }
      },

      TSInterfaceDeclaration(node) {
        if (isCallableStateFacadeInterface(node.body)) {
          context.report({ node, messageId: 'facade' });
        }
      },
    };
  },
};

function isCallableStateFacade(type) {
  if (type.type === 'TSIntersectionType') {
    const callable = type.types.some((part) => part.type === 'TSFunctionType');
    return callable && type.types.some(hasMutationMembers);
  }

  return (
    type.type === 'TSTypeLiteral' &&
    type.members.some((member) => member.type === 'TSCallSignatureDeclaration') &&
    hasMutationMembers(type)
  );
}

function isCallableStateFacadeInterface(body) {
  return (
    body.body.some((member) => member.type === 'TSCallSignatureDeclaration') &&
    hasMutationMembers(body)
  );
}

function hasMutationMembers(type) {
  const methods = new Set(
    type.members
      .map((member) => getMemberName(member.key))
      .filter((name) => MUTATION_METHODS.has(name)),
  );
  return methods.size > 0;
}

function getMemberName(key) {
  if (key?.type === 'Identifier') return key.name;
  if (key?.type === 'Literal' && typeof key.value === 'string') {
    return key.value;
  }
  return undefined;
}
