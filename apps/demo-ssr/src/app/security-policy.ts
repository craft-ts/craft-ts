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
      'component:SsrLabApp#1 / component:CraftRouterOutlet#10 / service:craftRouterOutletState#11 / route:static#12 / component:SsrStaticPage#13 / service:ssrStaticPageView#14 / state:counter / state:counter#1',
      'component:SsrLabApp#1 / component:CraftRouterOutlet#10 / service:craftRouterOutletState#11 / route:data#12 / component:SsrDataPage#13 / service:ssrDataPageView#14 / query:ssrData / query:ssrData#1',
      'component:SsrLabApp#1 / component:CraftRouterOutlet#10 / service:craftRouterOutletState#11 / route:fallback#12 / component:SsrFallbackPage#13 / service:ssrFallbackPageView#14 / query:deferredData / query:deferredData#1',
      'component:SsrLabApp#1 / component:CraftRouterOutlet#10 / service:craftRouterOutletState#11 / route:client-only#12 / component:SsrClientOnlyPage#13 / service:ssrClientOnlyPageView#14 / query:clientOnlyData / query:clientOnlyData#1',
    ],
    maxBytes: 256_000,
    maxDepth: 12,
  },
} satisfies CraftSecurityPolicyInput;
