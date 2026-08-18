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
> {
  readonly id: Id;
  readonly input: InputSchema;
  readonly output?: OutputSchema;
  readonly exposure: ServerFunctionExposure;
}

export interface ServerFunctionContract<
  InputSchema extends CraftSchema = CraftSchema,
  Exposure extends ServerFunctionExposure = ServerFunctionExposure,
  OutputSchema extends CraftSchema | undefined = CraftSchema | undefined,
  Id extends string = string,
> {
  readonly id: Id;
  readonly input: InputSchema;
  readonly output?: OutputSchema;
  readonly exposure: Exposure;
  readonly __serverFunctionContract: true;
}

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
>({
  id,
  input,
  output,
  exposure,
}: ServerFunctionContractOptions<InputSchema, OutputSchema, Id> & {
  readonly exposure: Exposure;
}): ServerFunctionContract<InputSchema, Exposure, OutputSchema, Id> {
  assertServerFunctionId(id);
  return Object.freeze({
    id,
    input,
    ...(output === undefined ? {} : { output }),
    exposure,
    __serverFunctionContract: true as const,
  }) as ServerFunctionContract<InputSchema, Exposure, OutputSchema, Id>;
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
