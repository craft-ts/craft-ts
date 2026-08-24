import type {
  CraftSchema,
  SchemaInput,
  SchemaOutput,
} from './schema-validation';

export type ServerFunctionExposure = 'server' | 'client';

export interface ServerFunctionContractOptions<
  InputSchema extends CraftSchema = CraftSchema,
  OutputSchema extends CraftSchema | undefined = undefined,
  Id extends string = string,
  ClientContextSchema extends CraftSchema | undefined = undefined,
> {
  readonly id: Id;
  readonly input: InputSchema;
  readonly output?: OutputSchema;
  readonly exposure: ServerFunctionExposure;
  /**
   * Schéma du contexte **client** attendu par la fonction : ce que la chaîne de
   * middleware client du navigateur doit produire, et que le registre revalide
   * avant de le passer au handler sous `context.clientContext`.
   *
   * Il est déclaré ici, et non par un import du middleware client, parce qu'un
   * module serveur ne doit jamais importer un `*.mw-client.ts` au runtime : la
   * correspondance est vérifiée par TypeScript au site d'attache côté client,
   * et par le graphe d'architecture entre les deux fichiers.
   */
  readonly clientContext?: ClientContextSchema;
}

export interface ServerFunctionContract<
  InputSchema extends CraftSchema = CraftSchema,
  Exposure extends ServerFunctionExposure = ServerFunctionExposure,
  OutputSchema extends CraftSchema | undefined = CraftSchema | undefined,
  Id extends string = string,
  ClientContextSchema extends CraftSchema | undefined = CraftSchema | undefined,
> {
  readonly id: Id;
  readonly input: InputSchema;
  readonly output?: OutputSchema;
  readonly exposure: Exposure;
  readonly clientContext?: ClientContextSchema;
  readonly __serverFunctionContract: true;
}

/**
 * Ce que le handler lit sous `context.clientContext` : la sortie du schéma
 * déclaré par le contrat, ou rien quand la fonction n'en attend pas.
 */
export type ServerFunctionClientContext<
  Contract extends ServerFunctionContract<any, any, any, any, any>,
> = Contract extends ServerFunctionContract<
  any,
  any,
  any,
  any,
  infer ClientContextSchema
>
  ? ClientContextSchema extends CraftSchema
    ? SchemaOutput<ClientContextSchema>
    : Record<never, never>
  : Record<never, never>;

/** Le pendant côté navigateur : ce que la chaîne client doit produire. */
export type ServerFunctionClientContextInput<
  Contract extends ServerFunctionContract<any, any, any, any, any>,
> = Contract extends ServerFunctionContract<
  any,
  any,
  any,
  any,
  infer ClientContextSchema
>
  ? ClientContextSchema extends CraftSchema
    ? SchemaInput<ClientContextSchema>
    : Record<never, never>
  : Record<never, never>;

export type ServerFunctionContractInput<
  Contract extends ServerFunctionContract,
> = SchemaInput<Contract['input']>;

export type ServerFunctionContractOutput<
  Contract extends ServerFunctionContract,
> = Contract extends ServerFunctionContract<
  infer _InputSchema,
  infer _Exposure,
  infer OutputSchema
>
  ? OutputSchema extends CraftSchema
    ? SchemaOutput<OutputSchema>
    : unknown
  : never;

export function serverFunctionContract<
  const Id extends string,
  InputSchema extends CraftSchema,
  Exposure extends ServerFunctionExposure,
  OutputSchema extends CraftSchema | undefined = undefined,
  ClientContextSchema extends CraftSchema | undefined = undefined,
>({
  id,
  input,
  output,
  exposure,
  clientContext,
}: ServerFunctionContractOptions<
  InputSchema,
  OutputSchema,
  Id,
  ClientContextSchema
> & {
  readonly exposure: Exposure;
}): ServerFunctionContract<
  InputSchema,
  Exposure,
  OutputSchema,
  Id,
  ClientContextSchema
> {
  assertServerFunctionId(id);
  return Object.freeze({
    id,
    input,
    ...(output === undefined ? {} : { output }),
    ...(clientContext === undefined ? {} : { clientContext }),
    exposure,
    __serverFunctionContract: true as const,
  }) as ServerFunctionContract<
    InputSchema,
    Exposure,
    OutputSchema,
    Id,
    ClientContextSchema
  >;
}

export function isServerFunctionContract(
  value: unknown,
): value is ServerFunctionContract {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { __serverFunctionContract?: unknown })
      .__serverFunctionContract === true
  );
}

export function assertServerFunctionId(id: string): void {
  if (!/^[A-Za-z][A-Za-z0-9._:-]*$/.test(id)) {
    throw new Error(
      `Invalid server function id "${id}". Use a stable dotted identifier.`,
    );
  }
}
