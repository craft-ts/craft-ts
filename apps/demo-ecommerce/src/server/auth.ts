import { Effect } from 'effect';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { demoAccounts, type AccountRole, type AccountSession, type AccountUser } from '../shared/accounts';

export class AuthError extends Error {
  readonly _tag = 'AuthError';
  readonly status: 401 | 403;
  constructor(message: string, status: 401 | 403) {
    super(message);
    this.status = status;
  }
}

const sessionTtlMs = 8 * 60 * 60 * 1000;
const digest = (value: string) => createHash('sha256').update(value).digest();
const accounts = demoAccounts.map(({ id, name, email, role, password }) => ({ user: { id, name, email, role } satisfies AccountUser, passwordDigest: digest(password) }));
// Sessions en mémoire : un redémarrage du serveur déconnecte tout le monde, et
// la vitrine le traite comme une session expirée.
const sessions = new Map<string, { readonly user: AccountUser; readonly expiresAt: number }>();

export function signIn(email: string, password: string): Effect.Effect<AccountSession, AuthError> {
  return Effect.suspend(() => {
    const account = accounts.find((row) => row.user.email === email.trim().toLowerCase());
    // La comparaison a lieu même pour un e-mail inconnu : la durée de réponse ne
    // dit pas lequel des deux champs est faux.
    const matches = timingSafeEqual(digest(password), account?.passwordDigest ?? digest('\0'));
    if (!account || !matches) return Effect.fail(new AuthError('E-mail ou mot de passe incorrect.', 401));
    const token = randomUUID();
    sessions.set(token, { user: account.user, expiresAt: Date.now() + sessionTtlMs });
    return Effect.succeed({ token, user: account.user });
  });
}

export function signOut(token: string): Effect.Effect<void> {
  return Effect.sync(() => { sessions.delete(token); });
}

function requireRole(token: string, roles: readonly AccountRole[], refusal: string): Effect.Effect<AccountUser, AuthError> {
  return Effect.suspend(() => {
    const session = sessions.get(token);
    if (!session || session.expiresAt < Date.now()) {
      sessions.delete(token);
      return Effect.fail(new AuthError('Session expirée : reconnectez-vous.', 401));
    }
    if (!roles.includes(session.user.role)) return Effect.fail(new AuthError(refusal, 403));
    return Effect.succeed(session.user);
  });
}

/** L'équipe (administrateurs et product managers) : ouvrir l'administration et consulter le catalogue complet. */
export const requireStaff = (token: string) => requireRole(token, ['admin', 'product-manager'], 'Ce compte n’a pas accès à l’administration.');

/** Revalidates a persisted browser session with the auth service. */
export function getCurrentSession(token: string): Effect.Effect<AccountSession, AuthError> {
  return Effect.map(
    requireRole(token, ['admin', 'product-manager', 'client'], 'Session invalide.'),
    (user) => ({ token, user }),
  );
}

/** Les administrateurs seulement : toute écriture dans le catalogue, les catégories ou les données. */
export const requireAdmin = (token: string) => requireRole(token, ['admin'], 'Action réservée aux administrateurs.');
