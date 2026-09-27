const { createNameMatchRule } = require('./craft-name-match-utils.cjs');

/**
 * `state`, `query`, `mutation`, `asyncProcess` and `queryParams` take their
 * name as first argument. Inside a `craftService` that name is the public key
 * the primitive is exposed under, so it has to match the variable it is bound
 * to. The autofix rewrites the name — except for a primitive a service
 * exposes, where it would rename the service's API (see
 * `craft-name-match-utils.cjs`).
 */
function createPrimitiveNameMatchRule(calleeName) {
  return createNameMatchRule({
    calleeName,
    unnamedWhenSingleArgument: calleeName === 'state',
    description: `Require the ${calleeName}(...) name to match the variable it is bound to: inside a craftService it is the key the primitive is exposed under.`,
    requireImport: true,
  });
}

module.exports = {
  'craft-state-name-match': createPrimitiveNameMatchRule('state'),
  'craft-query-name-match': createPrimitiveNameMatchRule('query'),
  'craft-mutation-name-match': createPrimitiveNameMatchRule('mutation'),
  'craft-async-process-name-match':
    createPrimitiveNameMatchRule('asyncProcess'),
  'craft-query-params-name-match': createPrimitiveNameMatchRule('queryParams'),
};
