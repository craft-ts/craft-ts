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
  /** Defaults to the primitive's own value for `holds` and `restores`. */
  readonly read?: () => unknown;
  /** Defaults to writing the primitive itself for `holds` and `restores`. */
  readonly write?: (value: unknown) => unknown;
  readonly expect?: CraftResumeExpectation;
  /** What to do when the live outcome differs from `expect` (default `degraded`). */
  readonly onMismatch?: CraftResumeMismatchPolicy;
  /** `false` on a `requires` action (a method-triggered query): it is never re-run by the resume. */
  readonly refetch?: false;
  /** Undoes a successful `acquire` when the resume is abandoned (sign out, delete). */
  readonly cleanup?: () => unknown;
}

/** What an adapter may return: the value, a promise of it, or a craft generator. */
export type CraftResumeResult<Value> =
  | Value
  | Promise<Value>
  | Generator<unknown, Value | undefined, unknown>;

type Decrement = [never, 0, 1, 2, 3, 4];

type CraftResumePathTail<Value, Depth extends number> = [Depth] extends [never]
  ? never
  : Value extends readonly (infer Item)[]
    ? '[*]' | `[${number}]` | `[*]${CraftResumePathTail<NonNullable<Item>, Decrement[Depth]>}`
    : Value extends object
      ? {
          [Key in keyof Value & string]:
            | `.${Key}`
            | `.${Key}${CraftResumePathTail<NonNullable<Value[Key]>, Decrement[Depth]>}`;
        }[keyof Value & string]
      : never;

/**
 * A path into a resource value (`$.user.id`); any string when the resource
 * is not typed.
 */
export type CraftResumePath<Value> = unknown extends Value
  ? string
  : '$' | `$${CraftResumePathTail<NonNullable<Value>, 4>}`;

/** A declaration as written: the resource may be typed, adapters follow its value. */
export interface CraftResumeDeclarationInput<Name extends string, Value>
  extends Omit<
    CraftResumeDeclaration<Name>,
    'resource' | 'path' | 'acquire' | 'read' | 'write'
  > {
  readonly resource: Name | CraftResumeResource<Name, Value>;
  readonly path?: CraftResumePath<Value>;
  readonly acquire?: (persona: CraftResumePersona) => CraftResumeResult<Value>;
  readonly read?: () => CraftResumeResult<Value>;
  readonly write?: (value: Value) => unknown;
}

/** The primitive a declaration is attached to: read it, write it. */
export interface CraftResumeSelf<Value = unknown> {
  (): Value;
  set(value: Value): void;
}

const RESUME_FACTORY = Symbol('craftResumeFactory');

/** A declaration built once its primitive exists (`craftResume((self) => …)`). */
export interface CraftResumeFactory<Resource extends string = string> {
  readonly [RESUME_FACTORY]: (
    self: CraftResumeSelf,
  ) => CraftResumeDeclaration<Resource>;
}

/** What a primitive's `resume` option accepts. */
export type CraftResumeSpec<Resource extends string = string> =
  | CraftResumeDeclaration<Resource>
  | CraftResumeFactory<Resource>;

function normalizeCraftResume<Name extends string, Value>(
  declaration: CraftResumeDeclarationInput<Name, Value>,
): CraftResumeDeclaration<Name> {
  const resource =
    typeof declaration.resource === 'string'
      ? declaration.resource
      : declaration.resource.name;
  return Object.freeze({
    ...declaration,
    resource,
  }) as unknown as CraftResumeDeclaration<Name>;
}

export function craftResume<const Name extends string, Value = unknown>(
  declaration: CraftResumeDeclarationInput<Name, Value>,
): CraftResumeDeclaration<Name>;
export function craftResume<const Name extends string, Value = unknown>(
  factory: (self: CraftResumeSelf<Value>) => CraftResumeDeclarationInput<Name, Value>,
): CraftResumeFactory<Name>;
export function craftResume(
  declaration:
    | CraftResumeDeclarationInput<string, unknown>
    | ((self: CraftResumeSelf) => CraftResumeDeclarationInput<string, unknown>),
): CraftResumeSpec {
  if (typeof declaration !== 'function') return normalizeCraftResume(declaration);
  return Object.freeze({
    [RESUME_FACTORY]: (self: CraftResumeSelf) =>
      normalizeCraftResume(declaration(self)),
  });
}

/** Resolves a spec against the primitive it is attached to (registry only). */
export function ɵresolveCraftResume(
  spec: CraftResumeSpec | undefined,
  self: CraftResumeSelf,
): CraftResumeDeclaration | undefined {
  if (!spec) return undefined;
  return RESUME_FACTORY in spec ? spec[RESUME_FACTORY](self) : spec;
}

const WITH_RESUME = Symbol('craftWithResume');

/** Attaches a declaration to a `state`, as its last argument. */
export interface CraftWithResume<Resource extends string = string> {
  readonly [WITH_RESUME]: CraftResumeSpec<Resource>;
}

export function withResume<Resource extends string>(
  spec: CraftResumeSpec<Resource>,
): CraftWithResume<Resource> {
  return Object.freeze({ [WITH_RESUME]: spec });
}

/** The declaration a `withResume` insertion carries, if this is one. */
export function ɵwithResumeSpecOf(
  insertion: unknown,
): CraftResumeSpec | undefined {
  return typeof insertion === 'object' &&
    insertion !== null &&
    WITH_RESUME in insertion
    ? (insertion as CraftWithResume)[WITH_RESUME]
    : undefined;
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
