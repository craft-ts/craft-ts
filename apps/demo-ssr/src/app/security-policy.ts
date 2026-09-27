/**
 * Politique de sécurité de la démo.
 *
 * Le transfert est fermé par défaut : seules les adresses listées voyagent
 * jusqu'au navigateur, tout le reste est rechargé côté client. Une adresse
 * décrit le chemin de la primitive dans l'arbre, elle change donc si ce
 * chemin change — c'est voulu : un nouvel état ne devient pas transférable
 * par accident.
 */
import type { CraftSecurityPolicyInput } from '@craft-ts/core';

export const DEMO_SECURITY_POLICY = {
  transfer: {
    mode: 'allowlist',
    allow: [
      'component:SsrLabApp#2 / component:CraftRouterOutlet#20 / service:craftRouterOutletState#21 / route:static#33 / component:SsrStaticPage#34 / service:ssrStaticPageView#35 / state:counter / state:counter#1',
      'component:SsrLabApp#2 / component:CraftRouterOutlet#20 / service:craftRouterOutletState#21 / route:data#33 / component:SsrDataPage#34 / service:ssrDataPageView#35 / query:ssrData / query:ssrData#1',
      'component:SsrLabApp#2 / component:CraftRouterOutlet#20 / service:craftRouterOutletState#21 / route:fallback#33 / component:SsrFallbackPage#34 / service:ssrFallbackPageView#35 / query:deferredData / query:deferredData#1',
      'component:SsrLabApp#2 / component:CraftRouterOutlet#20 / service:craftRouterOutletState#21 / route:client-only#33 / component:SsrClientOnlyPage#34 / service:ssrClientOnlyPageView#35 / query:clientOnlyData / query:clientOnlyData#1',
    ],
    maxBytes: 256_000,
    maxDepth: 12,
  },
} satisfies CraftSecurityPolicyInput;
