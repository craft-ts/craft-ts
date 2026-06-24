export type RouteMigrationDiagnosticCode =
  | 'DYNAMIC_PATH'
  | 'COMPONENT_NOT_RESOLVABLE'
  | 'ANGULAR_GUARD_REQUIRES_REWRITE'
  | 'MULTIPLE_GUARDS_REQUIRE_COMPOSITION'
  | 'PARENT_CONTEXT_UNKNOWN'
  | 'DYNAMIC_REDIRECT'
  | 'ROUTE_SPLIT_RECOMMENDED'
  | 'APP_CONFIG_REQUIRES_CRAFT_ROUTES';

export type RouteMigrationDiagnostic = {
  code: RouteMigrationDiagnosticCode;
  filePath: string;
  routePath?: string;
  message: string;
};

export type RouteMigrationStatus =
  | { kind: 'migrated' }
  | { kind: 'preserved' }
  | {
      kind: 'manual';
      code: RouteMigrationDiagnosticCode;
      message: string;
    };
