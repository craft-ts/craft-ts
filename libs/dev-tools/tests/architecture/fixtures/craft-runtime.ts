export declare function craftService(
  ...args: unknown[]
): Record<string, (...args: never[]) => unknown>;
export declare function craftComponent(...args: unknown[]): unknown;
export declare function craftRoutes(...args: unknown[]): unknown;
export declare function craftRoute(...args: unknown[]): unknown;
export declare function state(...args: unknown[]): unknown;
export declare function query(...args: unknown[]): unknown;
export declare function mutation(...args: unknown[]): unknown;
export declare function craftUnique<T>(value: T): T;
export declare function insertStoragePersister(...args: unknown[]): unknown;
export declare function insertReactOnMutation(...args: unknown[]): unknown;
export declare function insertSelect(...args: unknown[]): unknown;
export declare function craftComputed(...args: unknown[]): unknown;
export declare function craftMethod(...args: unknown[]): unknown;
export declare function craftEffect(...args: unknown[]): unknown;
export declare function source$<T>(name: string): {
  emit: (value?: T) => void;
  set: (value: T) => void;
};
export declare function div(...args: unknown[]): unknown;
export declare function button(...args: unknown[]): unknown;
export declare function input(...args: unknown[]): unknown;
export declare function a(...args: unknown[]): unknown;
export declare function select(...args: unknown[]): unknown;
export declare function textarea(...args: unknown[]): unknown;
export declare function form(...args: unknown[]): unknown;
export declare function span(...args: unknown[]): unknown;
export declare function h(...args: unknown[]): unknown;
export declare const CraftHttpClient: {
  get(config: (helpers: { response: () => unknown }) => { url: string }): unknown;
  post(config: (helpers: { response: () => unknown }) => { url: string }): unknown;
};
