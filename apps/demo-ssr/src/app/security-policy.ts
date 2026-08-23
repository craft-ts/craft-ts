/**
 * Politique de sécurité de la démo.
 *
 * Le transfert est fermé par défaut : seules les adresses listées voyagent
 * jusqu'au navigateur, tout le reste est rechargé côté client. Une adresse
 * décrit le chemin de la primitive dans l'arbre, elle change donc si ce
 * chemin change — c'est voulu : un nouvel état ne devient pas transférable
 * par accident.
 */
export const DEMO_SECURITY_POLICY = {
  transfer: {
    mode: 'allowlist',
    allow: [
      'component:SsrLabApp#1 / component:CraftRouterOutlet#9 / route:static#10 / component:SsrStaticPage#11 / state:counter / state:counter#1',
      'component:SsrLabApp#1 / component:CraftRouterOutlet#9 / route:data#10 / component:SsrDataPage#11 / query:ssrData / query:ssrData#1',
      'component:SsrLabApp#1 / component:CraftRouterOutlet#9 / route:fallback#10 / component:SsrFallbackPage#11 / query:deferredData / query:deferredData#1',
      'component:SsrLabApp#1 / component:CraftRouterOutlet#9 / route:client-only#10 / component:SsrClientOnlyPage#11 / query:clientOnlyData / query:clientOnlyData#1',
    ],
    maxBytes: 256_000,
    maxDepth: 12,
  },
} as const;
