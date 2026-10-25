/** A named value that may cross the recording/reprise boundary. */
export interface CraftResumeResource<Name extends string, Value> {
  readonly name: Name;
  readonly __value?: Value;
}

export function craftResumeResource<const Name extends string, Value = unknown>(
  name: Name,
): CraftResumeResource<Name, Value> {
  return Object.freeze({ name }) as CraftResumeResource<Name, Value>;
}

export type CraftResumeRole =
  | 'provides'
  | 'holds'
  | 'requires'
  | 'revokes'
  | 'restores'
  | 'identity';
export type CraftResumeMismatchPolicy = 'abort' | 'recorded' | 'degraded';

/**
 * Where the recorded identity is read, as paths into the primitive's value
 * (`$.user.role`). Declared on a `holds` or `requires` primitive; the
 * dashboard resolves it from the archive, so it stays data.
 */
export interface CraftResumeIdentity {
  readonly role: string;
  readonly id?: string;
  /** Persistence key of a `holds` primitive, to read the identity from restored storage. */
  readonly storageKey?: string;
}

/**
 * Backend entities a primitive's value refers to (`$.products[*].id`). Those
 * found in restored application state are required by the resume preflight;
 * those only seen in server lists are expected.
 */
export interface CraftResumeEntity {
  readonly kind: string;
  readonly path: string;
}

export interface CraftResumeExpectation<Value = unknown> {
  readonly outcome: 'recorded';
  readonly match?: readonly (readonly (string | number)[])[];
  readonly value?: Value;
}

/** Inert declaration data. Functions are invoked only by the resume host. */
export interface CraftResumeDeclaration<Resource extends string = string> {
  readonly resource: Resource;
  readonly role: CraftResumeRole;
  /** Event-reference path used to associate recorded values with this resource. */
  readonly path?: string;
  /** Default persona role, for a resource that carries no identity (a guest cart). */
  readonly persona?: string;
  /** Exact operation ids this adapter may call; transports use `websocket:<absolute URL>`, `worker:<absolute URL>`, or `shared-worker:<absolute URL>`. */
  readonly calls?: readonly string[];
  readonly value?: unknown;
  readonly identity?: CraftResumeIdentity;
  readonly entities?: readonly CraftResumeEntity[];
  /** Locally executed adapter that reacquires the resource for a persona. */
  readonly acquire?: (
    persona: CraftResumePersona,
  ) => unknown | Promise<unknown>;
  readonly read?: () => unknown;
  readonly write?: (value: unknown) => unknown;
  readonly expect?: CraftResumeExpectation;
  /** What to do when the live outcome differs from `expect` (default `degraded`). */
  readonly onMismatch?: CraftResumeMismatchPolicy;
  /** `false` on a `requires` action (a method-triggered query): it is never re-run by the resume. */
  readonly refetch?: false;
  /** Undoes a successful `acquire` when the resume is abandoned (sign out, delete). */
  readonly cleanup?: () => unknown;
}

export function craftResume<const Resource extends string>(
  declaration: CraftResumeDeclaration<Resource>,
): CraftResumeDeclaration<Resource> {
  return Object.freeze({ ...declaration });
}

export interface CraftResumePersona {
  readonly role: string;
  readonly id?: string;
  readonly params: Readonly<Record<string, unknown>>;
}

/** Helpers shared by the application and the dashboard persona editor. */
export function validateCraftResumePersonas(
  value: unknown,
): readonly CraftResumePersona[] {
  if (!Array.isArray(value)) throw new TypeError('Personas must be an array.');
  return value.map((item, index) => {
    if (
      !item ||
      typeof item !== 'object' ||
      typeof (item as Record<string, unknown>)['role'] !== 'string' ||
      !(
        (item as Record<string, unknown>)['params'] &&
        typeof (item as Record<string, unknown>)['params'] === 'object' &&
        !Array.isArray((item as Record<string, unknown>)['params'])
      )
    ) {
      throw new TypeError(`Persona at index ${index} is invalid.`);
    }
    const persona = item as Record<string, unknown>;
    return Object.freeze({
      role: persona['role'] as string,
      ...(typeof persona['id'] === 'string' ? { id: persona['id'] } : {}),
      params: Object.freeze({
        ...(persona['params'] as Record<string, unknown>),
      }),
    });
  });
}
