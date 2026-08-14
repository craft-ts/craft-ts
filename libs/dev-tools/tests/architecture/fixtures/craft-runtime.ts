export declare function craftService(
  ...args: unknown[]
): Record<string, (...args: never[]) => unknown>;
export declare function craftComponent(...args: unknown[]): unknown;
export declare function craftRoutes(...args: unknown[]): unknown;
export declare function craftRoute(...args: unknown[]): unknown;
export declare function state(...args: unknown[]): unknown;
export declare function query(...args: unknown[]): unknown;
export declare function craftUnique<T>(value: T): T;
export declare function insertStoragePersister(...args: unknown[]): unknown;
export declare function craftComputed(...args: unknown[]): unknown;
export declare function craftMethod(...args: unknown[]): unknown;
export declare function source$<T>(name: string): {
  emit: (value?: T) => void;
  set: (value: T) => void;
};
export declare function div(...args: unknown[]): unknown;
export declare const CraftHttpClient: {
  get(config: (helpers: { response: () => unknown }) => { url: string }): unknown;
  post(config: (helpers: { response: () => unknown }) => { url: string }): unknown;
};
