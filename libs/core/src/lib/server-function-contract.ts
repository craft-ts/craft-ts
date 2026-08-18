import type {
  CraftSchema,
  SchemaInput,
  SchemaOutput,
} from './schema-validation';

export type ServerFunctionExposure = 'server' | 'client';

export interface ServerFunctionContractOptions<
  Schema extends CraftSchema = CraftSchema,
> {
  readonly id: string;
  readonly input: Schema;
  readonly exposure: ServerFunctionExposure;
}

export interface ServerFunctionContract<
  Schema extends CraftSchema = CraftSchema,
  Exposure extends ServerFunctionExposure = ServerFunctionExposure,
> {
  readonly id: string;
  readonly input: Schema;
  readonly exposure: Exposure;
  readonly __serverFunctionContract: true;
}

export type ServerFunctionContractInput<
  Contract extends ServerFunctionContract,
> = SchemaInput<Contract['input']>;

export type ServerFunctionContractOutput<
  Contract extends ServerFunctionContract,
> = SchemaOutput<Contract['input']>;

export function serverFunctionContract<
  Schema extends CraftSchema,
  Exposure extends ServerFunctionExposure,
>({
  id,
  input,
  exposure,
}: ServerFunctionContractOptions<Schema> & { readonly exposure: Exposure }):
  ServerFunctionContract<Schema, Exposure> {
  assertServerFunctionId(id);
  return Object.freeze({
    id,
    input,
    exposure,
    __serverFunctionContract: true as const,
  });
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
