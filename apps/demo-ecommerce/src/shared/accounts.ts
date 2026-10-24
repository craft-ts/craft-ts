export type AccountRole = 'admin' | 'product-manager' | 'client';

export interface AccountUser {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: AccountRole;
}

export interface AccountSession {
  readonly token: string;
  readonly user: AccountUser;
}

export interface DemoAccount extends AccountUser {
  readonly password: string;
  readonly description: string;
}

/**
 * Comptes de démonstration. Ils sont volontairement affichés sur la page de
 * connexion : la démo doit se parcourir sans ouvrir le code ni le README. Le
 * serveur ne fait confiance qu'à la session qu'il délivre, jamais au rôle
 * envoyé par le navigateur.
 */
export const demoAccounts: readonly DemoAccount[] = [
  { id: 'camille', name: 'Camille', email: 'camille@atelier.demo', password: 'atelier-admin', role: 'admin', description: 'Gérante : catalogue, catégories, stocks et commandes.' },
  { id: 'ines', name: 'Inès', email: 'ines@atelier.demo', password: 'atelier-produit', role: 'product-manager', description: 'Product manager : fait vivre les fiches produits du catalogue.' },
  { id: 'leo', name: 'Léo', email: 'leo@atelier.demo', password: 'atelier-client', role: 'client', description: 'Client fidèle : la boutique oui, l’administration non.' },
];
