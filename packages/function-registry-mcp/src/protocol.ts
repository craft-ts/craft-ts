export type RegistryMethod =
  | 'registry/list'
  | 'registry/get'
  | 'registry/call'
  | 'registry/resource/get'
  | 'registry/resource/set'
  | 'registry/resource/update'
  | 'registry/resource/patch'
  | 'registry/override'
  | 'registry/restore'
  | 'registry/logs';

export type PageMethod = 'page';

export type RegistryBrokerMethod =
  | RegistryMethod
  | PageMethod
  | 'registry/clients';

export type RegistryEntry = Readonly<{
  key: string;
  hostName: string;
  ancestry: readonly string[];
  capabilities: readonly string[];
  overrideActive: boolean;
}>;

export type RegistryLog = Readonly<{
  id: number;
  timestamp: string;
  event: string;
  key?: string;
  message: string;
}>;

export type PageMatch = Readonly<{
  index?: number;
  track?: string;
}>;

export type PageAction =
  | Readonly<{ id: string; fill: unknown; match?: PageMatch }>
  | Readonly<{ id: string; press?: string; match?: PageMatch }>
  | Readonly<{ id: string; match?: PageMatch }>;

export type PageControl = Readonly<{
  id: string;
  role: string;
  name: string;
  value?: unknown;
  enabled: boolean;
  index: number;
  track?: string;
}>;

export type PageControls = Readonly<{
  generation: number;
  surfaceRev: number;
  url: string;
  title?: string;
  status: 'ready';
  controls: readonly PageControl[];
}>;

export type PageSurface = Readonly<{
  type: 'page/surface';
  clientId: string;
  url: string;
  title?: string;
  controls: readonly PageControl[];
}>;

export type RegistryRequest = Readonly<{
  type: 'request';
  callId: string;
  method: RegistryMethod | PageMethod;
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
  clientId: string;
  pageUrl?: string;
  pageTitle?: string;
  entries: readonly RegistryEntry[];
  logs: readonly RegistryLog[];
}>;

export type RegistryClient = Readonly<{
  clientId: string;
  connectedAt: string;
  pageUrl?: string;
  pageTitle?: string;
  entryCount: number;
  logCount: number;
}>;
