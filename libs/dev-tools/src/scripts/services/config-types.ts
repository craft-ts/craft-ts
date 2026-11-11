export type ServiceMigrationScope =
  | 'global'
  | 'toProvide'
  | 'manuallyProvidedAtRoot'
  | 'function'
  | 'abstract';

export type ServiceMigrationStrategy = 'craftService' | 'ignore';

export type ServiceMigrationOverride = {
  file?: string;
  module?: string;
  symbol?: string;
  name?: string;
  providedIn?: ServiceMigrationScope;
  strategy?: ServiceMigrationStrategy;
};

export type CraftDevToolsConfig = {
  serviceMigration?: {
    overrides?: readonly ServiceMigrationOverride[];
  };
};

export function defineCraftDevToolsConfig<
  Config extends CraftDevToolsConfig,
>(config: Config): Config {
  return config;
}
