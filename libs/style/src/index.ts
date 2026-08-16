/**
 * ESQUISSE de `@craft-ng/style` — assez pour voir la tête que ça a, pas plus.
 *
 * Ce qui est réel : les brands nominaux, l'inférence du contrat de variantes,
 * le branchement sur les canaux de contrat du core, le produit cartésien.
 * Ce qui ne l'est pas : la table de propriétés (une douzaine de helpers écrits
 * à la main au lieu d'être générés depuis MDN/webref), le plugin d'émission, le
 * runtime de test, l'intégration au graphe.
 */
export * from './lib/values';
export * from './lib/props';
export * from './lib/css-vars';
export * from './lib/axes';
export * from './lib/obligations';
export * from './lib/styles';
