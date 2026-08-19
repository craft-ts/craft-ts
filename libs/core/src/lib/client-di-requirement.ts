import type { InjectionToken } from './host/craft-compat';

export type ServerFunctionToken<Value> = InjectionToken<Value>;

export type ServerPermissionRequirement = {
  readonly kind: 'server-permission';
  readonly permission: string;
  readonly __serverFunctionPipe: true;
};

export function requireServerPermission(
  permission: string,
): ServerPermissionRequirement {
  if (permission.length === 0) {
    throw new Error('A server permission must not be empty.');
  }
  return Object.freeze({
    kind: 'server-permission',
    permission,
    __serverFunctionPipe: true,
  } satisfies ServerPermissionRequirement);
}

/**
 * Ce qu'un `.pipe(...)` accepte.
 *
 * `requireClientDI` a vécu ici jusqu'à ce que le canal client existe vraiment.
 * Il déclarait un token, une clé de transport, un schéma et un mode — quatre
 * choses pour dire « lis cette valeur dans le navigateur ». Un middleware
 * client construit sur un handshake dit la même chose en la montrant :
 *
 * ```ts
 * craftHandshakeMiddleware(claimedUser, function* () {
 *   return { userId: yield* ClaimedUserId() };
 * });
 * ```
 *
 * La clé et le schéma viennent du handshake, donc les deux côtés ne peuvent
 * plus en dire deux choses différentes, et la règle d'architecture sait de quoi
 * elle parle. Le mode n'a plus lieu d'être : un générateur s'exécute à l'appel.
 */
export type ServerFunctionPipe = ServerPermissionRequirement;
