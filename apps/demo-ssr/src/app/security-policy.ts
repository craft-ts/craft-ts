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
      'component:SsrLabApp#1 / component:CraftRouterOutlet#9 / service:craftRouterOutletState#10 / route:static#11 / component:SsrStaticPage#12 / service:ssrStaticPageView#13 / state:counter / state:counter#1',
      'component:SsrLabApp#1 / component:CraftRouterOutlet#9 / service:craftRouterOutletState#10 / route:data#11 / component:SsrDataPage#12 / service:ssrDataPageView#13 / query:ssrData / query:ssrData#1',
      'component:SsrLabApp#1 / component:CraftRouterOutlet#9 / service:craftRouterOutletState#10 / route:fallback#11 / component:SsrFallbackPage#12 / service:ssrFallbackPageView#13 / query:deferredData / query:deferredData#1',
      'component:SsrLabApp#1 / component:CraftRouterOutlet#9 / service:craftRouterOutletState#10 / route:client-only#11 / component:SsrClientOnlyPage#12 / service:ssrClientOnlyPageView#13 / query:clientOnlyData / query:clientOnlyData#1',
    ],
    maxBytes: 256_000,
    maxDepth: 12,
  },
} satisfies CraftSecurityPolicyInput;
