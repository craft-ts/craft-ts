/**
 * Préréglage sécurité, inclus dans `recommended` et dans `effect` : ces
 * garde-fous portent sur des vecteurs d'attaque, pas sur du style, donc ils
 * s'appliquent par défaut plutôt que sur adhésion.
 */
module.exports = {
  'craft-ts/require-route-security-policy': 'error',
  'craft-ts/require-server-function-timeout': 'error',
  'craft-ts/no-auth-token-in-local-storage': 'error',
  'craft-ts/no-raw-user-url': 'error',
  'craft-ts/no-unsafe-transfer-state': 'error',
  'craft-ts/no-unsafe-html': 'error',
  'craft-ts/no-trust-forwarded-headers': 'error',
  'craft-ts/require-public-error-mapping': 'error',
};
