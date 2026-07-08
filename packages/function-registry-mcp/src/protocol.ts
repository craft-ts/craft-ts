export type RegistryMethod =
  | 'registry/list'
  | 'registry/get'
  | 'registry/call'
  | 'registry/logs';

export type RegistryEntry = Readonly<{
  key: string;
  hostName: string;
  ancestry: readonly string[];
}>;

export type RegistryLog = Readonly<{
  id: number;
  timestamp: string;
  event: string;
  key?: string;
  message: string;
}>;

export type RegistryRequest = Readonly<{
  type: 'request';
  callId: string;
  method: RegistryMethod;
  params?: Readonly<Record<string, unknown>>;
}>;

export type RegistryResponse = Readonly<{
  type: 'response';
  callId: string;
  result?: unknown;
  error?: Readonly<{ message: string }>;
}>;

export type RegistrySnapshot = Readonly<{
  type: 'registry/snapshot';
  entries: readonly RegistryEntry[];
  logs: readonly RegistryLog[];
}>;
