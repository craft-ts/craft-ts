import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import {
  craftHandshakeName,
  type CraftHandshakeName,
  type CraftHandshakeSchema,
} from './craft-handshake';
import type { CraftSchema, SchemaOutput } from './schema-validation';

export const CRAFT_REQUEST_CONTEXT = Symbol('craft-request-context');

export type CraftRequestContext<
  Name extends string,
  Schema extends CraftSchema,
> = Context.Service<SchemaOutput<Schema>, SchemaOutput<Schema>> & {
  readonly [CRAFT_REQUEST_CONTEXT]: true;
  readonly handshake: Name;
  readonly schema: Schema;
};

const contextsByHandshake = new Map<
  string,
  CraftRequestContext<string, CraftSchema>
>();

export function craftRequestContext<
  Name extends string,
  Schema extends CraftSchema,
>(
  handshake: CraftHandshakeSchema<Name, Schema>,
): CraftRequestContext<Name, Schema>;
export function craftRequestContext<
  Name extends string,
  Schema extends CraftSchema,
>(
  handshake: CraftHandshakeName<Name>,
  schema: Schema,
): CraftRequestContext<Name, Schema>;
export function craftRequestContext(
  handshake:
    | CraftHandshakeName<string>
    | CraftHandshakeSchema<string, CraftSchema>,
  schema?: CraftSchema,
): CraftRequestContext<string, CraftSchema> {
  const name = craftHandshakeName(handshake);
  if (!name)
    throw new Error('craftRequestContext expects a named craftHandshake.');
  const shape = schema ?? (handshake as CraftSchema);
  if (!shape['~standard']) {
    throw new Error(`Request context "${name}" requires a schema.`);
  }
  // This tag is intentionally dynamic: each named handshake gets its own
  // runtime Context.Service identity, which cannot be represented by a static
  // class declaration.
  const service = Context.Service<unknown, unknown>(
    `craft/request-context/${name}`,
  ) as CraftRequestContext<string, CraftSchema>;
  Object.assign(service, {
    [CRAFT_REQUEST_CONTEXT]: true as const,
    handshake: name,
    schema: shape,
  });
  contextsByHandshake.set(name, service);
  return service;
}

export function isCraftRequestContext(
  value: unknown,
): value is CraftRequestContext<string, CraftSchema> {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { [CRAFT_REQUEST_CONTEXT]?: unknown })[CRAFT_REQUEST_CONTEXT] ===
      true
  );
}

export function requestContextForHandshake(
  value: unknown,
): CraftRequestContext<string, CraftSchema> | undefined {
  const name = craftHandshakeName(value);
  return name ? contextsByHandshake.get(name) : undefined;
}

export function provideCraftRequestContexts<Value>(
  program: Effect.Effect<Value, unknown, unknown>,
  schemas: readonly CraftSchema[],
  value: Record<string, unknown>,
): Effect.Effect<Value, unknown, unknown> {
  let provided = program;
  for (const schema of schemas) {
    const context = requestContextForHandshake(schema);
    if (context) {
      provided = Effect.provideService(
        provided,
        context,
        value,
      ) as Effect.Effect<Value, unknown, unknown>;
    }
  }
  return provided;
}
