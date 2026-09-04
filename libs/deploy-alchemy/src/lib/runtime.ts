/**
 * The narrow port this provider needs from Alchemy.
 *
 * Alchemy is an optional peer dependency: keeping the surface to four
 * operations lets the preset logic be tested without installing an
 * infrastructure engine, and lets the real adapter stay a thin, replaceable
 * translation.
 */

export type AlchemyPhase = 'read' | 'up';

export type AlchemyResourceRequest = Readonly<{
  /** CraftTS resource type, e.g. `cloudflare:Worker`. */
  type: string;
  name: string;
  /** Declared properties. Never contains a secret value. */
  properties: Readonly<Record<string, unknown>>;
}>;

export type AlchemyResourceState = Readonly<{
  type: string;
  name: string;
  /** Outputs recorded by Alchemy, such as a URL or a resource identifier. */
  outputs: Readonly<Record<string, string>>;
  /**
   * Properties the recorded resource was created with, when the state keeps
   * them. Without them a preview cannot tell an update from an unchanged
   * resource, so it reports the safer of the two.
   */
  properties?: Readonly<Record<string, unknown>>;
}>;

export type AlchemyScope = Readonly<{
  /** Resources already recorded for this application and stage. */
  read(): Promise<readonly AlchemyResourceState[]>;
  /** Creates or updates one resource. Only called during the `up` phase. */
  apply(resource: AlchemyResourceRequest): Promise<AlchemyResourceState>;
  /** Commits the scope, letting Alchemy delete what is no longer declared. */
  finalize(): Promise<void>;
  /** Releases the scope without committing. */
  dispose(): Promise<void>;
}>;

export type AlchemyOpenOptions = Readonly<{
  app: string;
  stage: string;
  phase: AlchemyPhase;
  /** Workspace root used by Alchemy's generated stack and build commands. */
  rootDir?: string;
}>;

export type AlchemyRuntime = Readonly<{
  /** Version of the installed Alchemy, reported in diagnostics. */
  version: string;
  open(options: AlchemyOpenOptions): Promise<AlchemyScope>;
}>;

/** Resolves the runtime lazily, so importing the provider installs nothing. */
export type AlchemyRuntimeLoader = () => Promise<AlchemyRuntime>;
