import type { InjectionToken } from './host/craft-compat';

export type ClientDIRequirementMode =
  | 'snapshot'
  | 'reactive'
  | 'cancel-on-change';

export type ServerFunctionToken<Value> = InjectionToken<Value>;

export type ClientDIRequirement<Value = unknown> = {
  readonly kind: 'client-di';
  readonly token: ServerFunctionToken<Value>;
  readonly mode: ClientDIRequirementMode;
  readonly __serverFunctionPipe: true;
  readonly __requiresClientExposure: true;
};

/**
 * ATTENTION — déclaratif uniquement pour l'instant.
 *
 * `requireClientDI` retype le token accepté par `required()` et impose une
 * exposition client, mais aucune valeur du DI navigateur n'est encore
 * transportée jusqu'au serveur : `required()` résout dans le DI **du serveur**.
 * Le canal client → serveur (`sendContext`) est la V2 du plan middleware, voir
 * `docs/superpowers/plans/2026-08-18-server-function-middleware.md`.
 */
export function requireClientDI<Value>(
  token: ServerFunctionToken<Value>,
  options: { readonly mode?: ClientDIRequirementMode } = {},
): ClientDIRequirement<Value> {
  return Object.freeze({
    kind: 'client-di' as const,
    token,
    mode: options.mode ?? 'snapshot',
    __serverFunctionPipe: true as const,
    __requiresClientExposure: true as const,
  });
}

export type ServerPermissionRequirement = {
  readonly kind: 'server-permission';
  readonly permission: string;
  readonly __serverFunctionPipe: true;
  readonly __requiresClientExposure?: false;
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

export type ServerFunctionPipe =
  | ClientDIRequirement
  | ServerPermissionRequirement;

export type ClientDIRequirementOf<Pipe> = Pipe extends ClientDIRequirement<
  infer Value
>
  ? Value
  : never;

export type ClientDITokensOf<
  Pipes extends readonly ServerFunctionPipe[],
> = Pipes[number] extends infer Pipe
  ? Pipe extends ClientDIRequirement<infer Value>
    ? ServerFunctionToken<Value>
    : never
  : never;
