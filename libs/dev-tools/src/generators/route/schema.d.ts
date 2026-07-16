export type RouteGeneratorSchema = {
  path: string;
  project?: string;
  parent?: string;
  component?: string;
  createComponent?: string;
  featureFile?: string;
  redirectTo?: string;
  skipValidation?: boolean;
  yes?: boolean;
};

export type RouteSplitGeneratorSchema = {
  project?: string;
  parent: string;
  prefix: string;
  target: string;
  skipValidation?: boolean;
};
